/**
 * Completions from the compiler, in C++ files inside a workspace folder: the editor's text, the
 * folder's headers and its codal.json go to the worker, and Clang's list comes back as items.
 */
import * as vscode from 'vscode';

import { SECTION, SETTINGS } from '../config';
import { log } from '../log';
import { findSources, readFiles } from './build';
import { COMPLETABLE, HEADER, MAX_FILES, relativeTo } from './collect';
import type { Compiler } from './compiler';
import { byteColumn, isIncomplete, isMemberAccess, isNamedOnly, itemsOf, type Item, type ItemKind } from './items';
import type { Files } from './protocol';

const ENCODER = new TextEncoder();
// `>` and `:` open a list only as the end of `->` and `::`, not as a comparison or a label.
const TRIGGERED = /(\.|->|::)$/;
// An included file's name typed after its quote or last `/`, which Clang completes whole, dots and all.
const INCLUDE = /^\s*#\s*include\s*["<](?:[^">]*\/)?([^">/]*)$/;

const KINDS: Record<ItemKind, vscode.CompletionItemKind> = {
	method: vscode.CompletionItemKind.Method,
	function: vscode.CompletionItemKind.Function,
	field: vscode.CompletionItemKind.Field,
	variable: vscode.CompletionItemKind.Variable,
	class: vscode.CompletionItemKind.Class,
	namespace: vscode.CompletionItemKind.Module,
	constant: vscode.CompletionItemKind.Constant,
	keyword: vscode.CompletionItemKind.Keyword,
	snippet: vscode.CompletionItemKind.Snippet,
};

export function registerCompletions(context: vscode.ExtensionContext, compiler: Compiler): void {
	// The last failure logged, so a codal.json being edited does not log once a word.
	let failed: string | undefined;
	const provider: vscode.CompletionItemProvider = {
		async provideCompletionItems(document, position, token, trigger) {
			const folder = vscode.workspace.getWorkspaceFolder(document.uri);
			const name = folder && relativeTo(folder.uri.path, document.uri.path);
			if (!folder || !name || !COMPLETABLE.test(name)) return undefined;
			const line = document.lineAt(position.line).text;
			const before = line.slice(0, position.character);
			if (trigger.triggerKind === vscode.CompletionTriggerKind.TriggerCharacter && !TRIGGERED.test(before)) return undefined;

			const include = INCLUDE.exec(before);
			// VS Code's own word would stop at the dot in `MicroBit.h`, so an included name has its range.
			const range = include ? new vscode.Range(position.line, position.character - include[1].length, position.line, position.character) : undefined;
			const word = range ?? document.getWordRangeAtPosition(position);
			// Asked at the start of the word, so the list holds every candidate and VS Code filters it.
			const start = word?.start.character ?? position.character;
			const end = word?.end.character ?? position.character;
			const where = {
				member: isMemberAccess(line.slice(0, start)),
				typed: line.slice(start, position.character),
				byName: isNamedOnly(line.slice(0, start), line.slice(end)),
			};
			const controller = new AbortController();
			token.onCancellationRequested(() => controller.abort());
			try {
				const files = await gather(folder, document, name, controller.signal);
				const records = await compiler.complete(files, { file: name, line: position.line + 1, column: byteColumn(line, start) }, { signal: controller.signal });
				failed = undefined;
				return new vscode.CompletionList(itemsOf(records, where).map((item) => toItem(item, range)), isIncomplete(records, where));
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				if (!controller.signal.aborted) {
					if (message !== failed) log(`No completions: ${message}`);
					failed = message;
				}
				return undefined;
			}
		},
	};
	context.subscriptions.push(vscode.languages.registerCompletionItemProvider({ language: 'cpp' }, provider, '.', '>', ':'));
}

function toItem(item: Item, range: vscode.Range | undefined): vscode.CompletionItem {
	const result = new vscode.CompletionItem({ label: item.name, detail: item.signature || undefined, description: item.type ?? undefined }, KINDS[item.kind]);
	result.detail = item.detail;
	if (item.documentation) result.documentation = item.documentation;
	result.insertText = item.snippet ? new vscode.SnippetString(item.insert) : item.insert;
	if (range) result.range = range;
	return result;
}

/** The document as it is in the editor, and the folder's headers and codal.json, any open editor's text in place of what is saved. */
async function gather(folder: vscode.WorkspaceFolder, document: vscode.TextDocument, name: string, signal: AbortSignal): Promise<Files> {
	const open = new Map(vscode.workspace.textDocuments.map((other) => [other.uri.toString(), other]));
	const read = async (uri: vscode.Uri) => {
		const editing = open.get(uri.toString());
		return editing ? ENCODER.encode(editing.getText()) : vscode.workspace.fs.readFile(uri);
	};

	const { uris } = await findSources(folder);
	// As the build does, rather than complete with some of the headers silently left out.
	if (uris.length > MAX_FILES) throw new Error(`more than ${MAX_FILES} C++ files in ${folder.name}; narrow it with the ${SECTION}.${SETTINGS.buildExclude} setting`);
	signal.throwIfAborted();
	const files = await readFiles(folder, uris.filter((uri) => HEADER.test(uri.path)), read);
	files[name] = ENCODER.encode(document.getText());
	return files;
}
