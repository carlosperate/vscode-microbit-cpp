import * as vscode from 'vscode';

/**
 * The active editor's folder, else the only folder, else a pick. Undefined when
 * nothing is open or the pick is dismissed.
 */
export async function pickFolder(): Promise<vscode.WorkspaceFolder | undefined> {
	const folders = vscode.workspace.workspaceFolders ?? [];
	if (folders.length === 0) return undefined;
	if (folders.length === 1) return folders[0];
	const active = vscode.window.activeTextEditor?.document.uri;
	const owner = active && vscode.workspace.getWorkspaceFolder(active);
	return owner ?? vscode.window.showWorkspaceFolderPick({ placeHolder: 'Which folder holds the micro:bit program?' });
}
