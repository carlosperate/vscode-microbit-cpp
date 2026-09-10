import * as vscode from 'vscode';

import { pickFolder } from '../build/folder';
import { PRODUCT } from '../config';
import { isAbsent } from '../fs';
import { log } from '../log';
import { TEMPLATE } from './template';

/**
 * Puts a starting main.cpp in the folder and opens it. A folder passed as the
 * argument, as the Explorer and the tests do, wins over the pick.
 */
export async function createProject(target?: unknown): Promise<void> {
	const picked = target instanceof vscode.Uri ? undefined : await pickFolder();
	const folder = target instanceof vscode.Uri ? target : picked?.uri;
	if (!folder) {
		void vscode.window.showErrorMessage(`${PRODUCT}: open the folder for the new project, then run Create Project.`);
		return;
	}
	// A workspace folder always has a name; an Explorer-supplied URI has only a path.
	const named = picked?.name ?? folder.path.split('/').pop() ?? folder.path;

	const main = vscode.Uri.joinPath(folder, 'main.cpp');
	let present: boolean;
	try {
		present = await exists(main);
	} catch (error) {
		void vscode.window.showErrorMessage(
			`${PRODUCT}: could not read ${main.path}, so nothing was written. ${error instanceof Error ? error.message : String(error)}`
		);
		return;
	}

	if (present) {
		void vscode.window.showInformationMessage(`${PRODUCT}: ${named} already has a main.cpp.`);
	} else {
		await vscode.workspace.fs.writeFile(main, new TextEncoder().encode(TEMPLATE));
		log(`Created ${main.toString()}`);
	}
	await vscode.window.showTextDocument(main);
}

/**
 * Only "not there" means it is safe to write. Any other failure could be a file we simply cannot
 * see, and overwriting somebody's program is not a mistake they can undo.
 */
async function exists(uri: vscode.Uri): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(uri);
		return true;
	} catch (error) {
		if (isAbsent(error)) return false;
		throw error;
	}
}
