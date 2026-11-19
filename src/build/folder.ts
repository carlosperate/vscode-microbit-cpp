import * as vscode from 'vscode';

import { PRODUCT } from '../config';

/**
 * The active editor's folder, else the only folder, else a pick. Undefined when
 * nothing is open or the pick is dismissed; an empty window is told to open a
 * folder when `then` says what to do after.
 */
export async function pickFolder(then?: string): Promise<vscode.WorkspaceFolder | undefined> {
	const folders = vscode.workspace.workspaceFolders ?? [];
	if (folders.length === 0) {
		// Dismissing the pick is an answer, not a mistake, so only an empty window gets a message.
		if (then) void vscode.window.showErrorMessage(`${PRODUCT}: open the folder that holds main.cpp, then ${then}.`);
		return undefined;
	}
	if (folders.length === 1) return folders[0];
	const active = vscode.window.activeTextEditor?.document.uri;
	const owner = active && vscode.workspace.getWorkspaceFolder(active);
	return owner ?? vscode.window.showWorkspaceFolderPick({ placeHolder: 'Which folder holds the micro:bit program?' });
}
