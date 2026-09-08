/**
 * Everything both entry points do the same way. The two hosts read the shipped
 * toolchain and reach a board by unrelated means, so the commands are the seam
 * and everything else sits above.
 */
import * as vscode from 'vscode';

import { COMMANDS, PRODUCT, type CommandId } from './config';
import { createLog, log } from './log';

export type CommandHandler = (context: vscode.ExtensionContext, ...args: unknown[]) => Promise<void>;

/** Which entry point ran. Handed back from `activate` because nothing else can see it. */
export interface ExtensionApi {
	entry: Entry;
}

export type Entry = 'browser' | 'node';

/** What one entry point supplies, over the shared wiring below. */
export interface Host {
	entry: Entry;
	commands: Partial<Record<CommandId, CommandHandler>>;
}

export function activateHost(context: vscode.ExtensionContext, host: Host): ExtensionApi {
	createLog(context);
	log(`Extension activated, ${host.entry} entry`);

	// Manifest titles keep stub notifications in sync with the command palette.
	const titles = contributedTitles(context);
	for (const id of Object.values(COMMANDS)) {
		const implementation = host.commands[id];
		context.subscriptions.push(
			// Whatever a caller passes is forwarded intact, rather than dropped here.
			vscode.commands.registerCommand(id, async (...args: unknown[]) => {
				log(`Running ${id}`);
				try {
					if (implementation) return await implementation(context, ...args);
					void vscode.window.showInformationMessage(
						`${PRODUCT}: ${titles.get(id) ?? id} is not implemented yet.`
					);
				} catch (error) {
					// Rethrown: anything reaching here is a defect, and should stay loud.
					log(`${id} failed: ${String(error)}`);
					throw error;
				}
			})
		);
	}

	return { entry: host.entry };
}

function contributedTitles(context: vscode.ExtensionContext): Map<string, string> {
	const contributed: { command: string; title: string }[] =
		context.extension.packageJSON?.contributes?.commands ?? [];
	return new Map(contributed.map((entry) => [entry.command, entry.title]));
}
