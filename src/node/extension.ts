/**
 * The desktop entry point. The compiler runs in a `worker_threads` worker, so
 * its memory and any crash stay out of the extension host.
 */
import * as vscode from 'vscode';

import { activateHost, type ExtensionApi } from '../activate';
import { spawnWorker } from './spawn';

export function activate(context: vscode.ExtensionContext): ExtensionApi {
	const script = vscode.Uri.joinPath(context.extensionUri, 'dist', 'worker.node.mjs').fsPath;
	return activateHost(context, { entry: 'node', spawn: () => spawnWorker(script) });
}

export function deactivate(): void {}
