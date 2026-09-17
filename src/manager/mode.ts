/**
 * What this extension registers with the manager: a segment labelled C++, a
 * claim on workspaces that look like a CODAL project, and the entries the status
 * bar menu offers while this is the active mode. The view itself is the
 * manifest's, gated on the key the manager sets for this mode.
 */
import type { Mode } from 'vscode-bbcmicrobit-manager-api';
import * as vscode from 'vscode';

import { CLAIM_GLOB, excludeGlob } from '../build/collect';
import { COMMANDS, EXTENSION_ID, MANAGER_API_VERSION, MODE_ID, MODE_LABEL, SECTION, SETTINGS } from '../config';
import { log } from '../log';

/** In the order the work happens, which is neither the manifest's nor the palette's. */
const MENU: readonly string[] = [COMMANDS.build, COMMANDS.flash, COMMANDS.createProject];

export function createMode(context: vscode.ExtensionContext): Mode {
	const claimChanged = new vscode.EventEmitter<void>();
	// Creations and deletions only: an edit changes nothing about whether a file is there.
	const watcher = vscode.workspace.createFileSystemWatcher(CLAIM_GLOB, false, true, false);
	context.subscriptions.push(
		claimChanged,
		watcher,
		watcher.onDidCreate(() => claimChanged.fire()),
		watcher.onDidDelete(() => claimChanged.fire()),
		vscode.workspace.onDidChangeWorkspaceFolders(() => claimChanged.fire()),
		vscode.workspace.onDidChangeConfiguration((event) => {
			// Both, because the claim applies Build's excludes and those are the two it reads.
			if (event.affectsConfiguration(`${SECTION}.${SETTINGS.buildExclude}`) || event.affectsConfiguration('files.exclude')) {
				claimChanged.fire();
			}
		})
	);

	// Manifest titles, so the menu and the palette cannot drift.
	const titles = contributedTitles(context);
	return {
		apiVersion: MANAGER_API_VERSION,
		id: MODE_ID,
		extensionId: EXTENSION_ID,
		label: MODE_LABEL,
		claimsWorkspace,
		onDidChangeWorkspaceClaim: claimChanged.event,
		menuCommands: MENU.map((command) => ({ command, label: titles.get(command) ?? command })),
	};
}

/**
 * A workspace looks like this extension's own when a folder holds a `codal.json`
 * or a source Build would compile, with the excludes Build uses, so the
 * `libraries/` of a samples checkout never speaks for the folder.
 */
export async function claimsWorkspace(): Promise<boolean> {
	for (const folder of vscode.workspace.workspaceFolders ?? []) {
		const { glob } = excludeGlob(
			vscode.workspace.getConfiguration(SECTION, folder.uri).get<unknown>(SETTINGS.buildExclude),
			vscode.workspace.getConfiguration('files', folder.uri).get<unknown>('exclude')
		);
		try {
			const found = await vscode.workspace.findFiles(
				new vscode.RelativePattern(folder, CLAIM_GLOB),
				glob === null ? null : new vscode.RelativePattern(folder, glob),
				1
			);
			if (found.length > 0) return true;
		} catch (error) {
			log(`Could not look for a C++ project in ${folder.uri.toString()}: ${String(error)}`);
		}
	}
	return false;
}

function contributedTitles(context: vscode.ExtensionContext): Map<string, string> {
	const contributed: { command: string; title: string }[] = context.extension.packageJSON?.contributes?.commands ?? [];
	return new Map(contributed.map((entry) => [entry.command, entry.title]));
}
