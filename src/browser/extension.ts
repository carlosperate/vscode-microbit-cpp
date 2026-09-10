/**
 * The web entry point. The compiler starts as a nested Web Worker from the
 * extension's own URL; VS Code's extension host loads it through an
 * importScripts bootstrap, which is why the worker bundle is a classic script.
 */
import * as vscode from 'vscode';

import { activateHost, type ExtensionApi } from '../activate';
import { spawnWorker } from './spawn';

export function activate(context: vscode.ExtensionContext): ExtensionApi {
	const script = vscode.Uri.joinPath(context.extensionUri, 'dist', 'worker.browser.js').toString(true);
	return activateHost(context, { entry: 'browser', spawn: () => spawnWorker(script) });
}

export function deactivate(): void {}
