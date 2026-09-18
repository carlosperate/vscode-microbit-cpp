/**
 * Everything both entry points do the same way. A host differs only in how it
 * starts the compiler worker, so that is what it supplies and the rest sits here.
 */
import * as vscode from 'vscode';

import { createBuild, type Builds } from './build/build';
import { Compiler, type CompilerWorker } from './build/compiler';
import { flash } from './build/flash';
import { COMMANDS, type CommandId } from './config';
import { createLog, log } from './log';
import { linkManager, type ManagerStatus } from './manager/link';
import { menuGroup } from './manager/menu';
import { createProject } from './project/create';
import { createPanel } from './ui/panel';

export type Entry = 'browser' | 'node';

export interface Host {
	entry: Entry;
	spawn: () => CompilerWorker;
}

/** Handed back from `activate` for the integration tests, which cannot see inside otherwise. */
export interface ExtensionApi {
	entry: Entry;
	builds: Builds;
	manager: ManagerStatus;
}

export function activateHost(context: vscode.ExtensionContext, host: Host): ExtensionApi {
	createLog(context);
	log(`Extension activated, ${host.entry} entry`);

	const assets = vscode.Uri.joinPath(context.extensionUri, 'dist', 'assets');
	const compiler = new Compiler({
		spawn: host.spawn,
		loadAsset: (name) => {
			log(`Loading ${name}`);
			return vscode.workspace.fs.readFile(vscode.Uri.joinPath(assets, ...name.split('/')));
		},
	});
	context.subscriptions.push({ dispose: () => compiler.dispose() });

	const builds = createBuild(compiler);
	createPanel(context);
	const manager = linkManager(context, menuGroup(context));

	const commands: Record<CommandId, (...args: unknown[]) => Promise<void>> = {
		[COMMANDS.build]: async () => {
			await builds.build();
		},
		[COMMANDS.flash]: flash(manager, builds),
		[COMMANDS.createProject]: createProject,
	};
	for (const [id, run] of Object.entries(commands)) {
		context.subscriptions.push(
			vscode.commands.registerCommand(id, async (...args: unknown[]) => {
				log(`Running ${id}`);
				try {
					await run(...args);
				} catch (error) {
					// Rethrown: anything reaching here is a defect, and should stay loud.
					log(`${id} failed: ${String(error)}`);
					throw error;
				}
			})
		);
	}

	return { entry: host.entry, builds, manager: manager.status };
}
