import type { Optimisation } from 'microbit-clang-wasm-codal';
import * as vscode from 'vscode';

import { PRODUCT, SECTION, SETTINGS } from '../config';
import { log } from '../log';
import { pickFolder } from './folder';
import { DEBUG_LEVELS, debugLevelOf } from './levels';

export const debugLevel = (folder: vscode.WorkspaceFolder): Optimisation =>
	debugLevelOf(vscode.workspace.getConfiguration(SECTION, folder.uri).get(SETTINGS.debugOptimisation));

/** Saved in the folder's settings, so the level travels with the program; undefined clears it. */
export const saveDebugLevel = (folder: vscode.WorkspaceFolder, level: Optimisation | undefined): Thenable<void> =>
	vscode.workspace.getConfiguration(SECTION, folder.uri).update(SETTINGS.debugOptimisation, level, vscode.ConfigurationTarget.WorkspaceFolder);

export async function setDebugLevel(): Promise<void> {
	const folder = await pickFolder('set its debug build optimisation');
	if (!folder) return;
	const current = debugLevel(folder);
	const picked = await vscode.window.showQuickPick(
		(Object.entries(DEBUG_LEVELS) as [Optimisation, string][]).map(([level, detail]) => ({
			label: level,
			description: level === current ? 'current' : undefined,
			detail,
		})),
		{ title: `${PRODUCT}: debug build optimisation for ${folder.name}`, placeHolder: 'The level your own files compile at in a debug build. CODAL stays as built.' }
	);
	if (!picked) return;
	await saveDebugLevel(folder, picked.label);
	log(`Debug build optimisation for ${folder.name} set to ${picked.label}`);
}
