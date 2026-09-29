import * as vscode from 'vscode';

import { pickFolder } from '../build/folder';
import { PRODUCT } from '../config';
import { isAbsent } from '../fs';
import { log } from '../log';
import { CODAL_JSON, FILES, TEMPLATE } from './template';

/** Where a project made before the `source` folder keeps its program. */
const FLAT_MAIN = 'main.cpp';

/**
 * Puts `codal.json` and a starting `source/main.cpp` in the folder and opens the
 * program. A folder passed as the argument, as the Explorer and the tests do,
 * wins over the pick.
 */
export async function createProject(target?: unknown): Promise<void> {
	const picked = target instanceof vscode.Uri ? undefined : await pickFolder();
	const folder = target instanceof vscode.Uri ? target : picked?.uri;
	if (!folder) {
		void vscode.window.showErrorMessage(`${PRODUCT}: open the folder for the new project, then run Create C++ Project.`);
		return;
	}
	// A workspace folder always has a name; an Explorer-supplied URI has only a path.
	// `||`, not `??`: a path ending in a slash, such as a Windows drive root, splits to an empty name.
	const named = picked?.name || folder.path.split('/').pop() || folder.path;

	const main = vscode.Uri.joinPath(folder, FILES.main);
	const codalJson = vscode.Uri.joinPath(folder, FILES.codalJson);
	let existing: vscode.Uri | undefined;
	let configured: boolean;
	try {
		// Either place counts: a second main() beside an older project's would not link.
		const flat = vscode.Uri.joinPath(folder, FLAT_MAIN);
		existing = (await exists(main)) ? main : (await exists(flat)) ? flat : undefined;
		configured = await exists(codalJson);
	} catch (error) {
		void vscode.window.showErrorMessage(
			`${PRODUCT}: could not read ${folder.path}, so nothing was written. ${error instanceof Error ? error.message : String(error)}`
		);
		return;
	}

	if (existing) {
		void vscode.window.showInformationMessage(`${PRODUCT}: ${named} already has a main.cpp.`);
		await vscode.window.showTextDocument(existing);
		return;
	}

	const encoder = new TextEncoder();
	if (!configured) await vscode.workspace.fs.writeFile(codalJson, encoder.encode(CODAL_JSON));
	await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(main, '..'));
	await vscode.workspace.fs.writeFile(main, encoder.encode(TEMPLATE));
	log(`Created ${main.toString()}`);
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
