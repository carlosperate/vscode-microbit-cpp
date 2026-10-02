import * as vscode from 'vscode';

import { OUTPUT_LANGUAGE, PRODUCT } from './config';

/**
 * The Web Worker console is unreliable, so diagnostics use one output channel.
 * Context ownership also disposes it when activation fails before `deactivate`.
 */
let channel: vscode.OutputChannel | undefined;

export function createLog(context: vscode.ExtensionContext): void {
	channel = vscode.window.createOutputChannel(PRODUCT, OUTPUT_LANGUAGE);
	context.subscriptions.push(channel, {
		dispose: () => {
			channel = undefined;
		},
	});
}

export function log(message: string): void {
	channel?.appendLine(message);
}

/** The compiler's own text, which brings its own line breaks. */
export function logRaw(text: string): void {
	channel?.append(text);
}

/** Blank lines, which are what sets one block of the log apart from the next. */
export function logGap(lines = 1): void {
	channel?.append('\n'.repeat(lines));
}

export function showLog(): void {
	channel?.show(true);
}
