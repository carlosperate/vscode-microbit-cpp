/**
 * The link to the BBC micro:bit Manager. The dependency in the manifest
 * guarantees it activated first, so its exports are there without an await;
 * what is not guaranteed is that they are the API this extension was built
 * against, and the manager is what decides that when the mode registers.
 */
import type { MicrobitManagerApi, Mode } from 'vscode-bbcmicrobit-manager-api';
import * as vscode from 'vscode';

import { MANAGER_EXTENSION, PRODUCT } from '../config';
import { log } from '../log';
import { isIncompatibleApiError, isManagerApi } from './api';

export interface ManagerStatus {
	readonly registered: boolean;
	/** Why the board cannot be reached from here, when it cannot. */
	readonly problem: string | undefined;
}

export interface ManagerLink {
	/** The API once the mode is registered with it. Undefined has already been explained. */
	api(): MicrobitManagerApi | undefined;
	readonly status: ManagerStatus;
}

const SHOW_EXTENSION = 'Show Extension';

export function linkManager(context: vscode.ExtensionContext, mode: Mode): ManagerLink {
	const status: { registered: boolean; problem: string | undefined } = { registered: false, problem: undefined };
	const exports: unknown = vscode.extensions.getExtension(MANAGER_EXTENSION)?.exports;
	const api = isManagerApi(exports) ? exports : undefined;

	if (!api) {
		status.problem = 'the BBC micro:bit Manager extension is not running, and it is what talks to the board.';
		log(status.problem);
		// Nobody else will say so: the manager's own message needs the manager.
		explain(status.problem);
	} else {
		try {
			context.subscriptions.push(api.registerMode(mode));
			status.registered = true;
			log(`Registered the ${mode.label} mode with the micro:bit Manager, API ${api.version}`);
		} catch (error) {
			status.problem = `the BBC micro:bit Manager refused this extension. ${describe(error)}`;
			log(status.problem);
			// Only a version mismatch is explained by the manager; any other refusal leaves no panel to say so.
			if (!isIncompatibleApiError(error)) explain(status.problem);
		}
	}

	return {
		api: () => {
			if (status.registered && api) return api;
			explain(status.problem ?? 'the BBC micro:bit Manager extension is not available.');
			return undefined;
		},
		status,
	};
}

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

function explain(problem: string): void {
	void vscode.window
		.showErrorMessage(`${PRODUCT}: ${problem}`, SHOW_EXTENSION)
		.then((picked) => (picked ? vscode.commands.executeCommand('extension.open', MANAGER_EXTENSION) : undefined))
		// Chained after, so a failed `extension.open` is logged too rather than left unhandled.
		.then(undefined, (error: unknown) => log(`Could not show the manager problem: ${String(error)}`));
}
