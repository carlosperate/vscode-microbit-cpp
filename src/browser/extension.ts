/**
 * The web entry point, and the one desktop does not use. Nothing is host-specific
 * here yet; the split exists because the compiler's assets and the board are
 * reached differently on the two hosts.
 */
import * as vscode from 'vscode';

import { activateHost, type ExtensionApi } from '../activate';

export function activate(context: vscode.ExtensionContext): ExtensionApi {
	return activateHost(context, { entry: 'browser', commands: {} });
}

export function deactivate(): void {}
