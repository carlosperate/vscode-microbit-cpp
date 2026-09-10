import * as vscode from 'vscode';

/**
 * Whether a filesystem error means the file is simply not there. The distinction is load bearing in
 * both directions: a missing output is nothing to report, and a missing file is the only case where
 * writing one cannot destroy something.
 */
export const isAbsent = (error: unknown): boolean =>
	error instanceof vscode.FileSystemError && error.code === 'FileNotFound';
