/**
 * The integration tests: one bundle run on two hosts, `@vscode/test-web` in a
 * browser and `@vscode/test-electron` on the desktop. They cover what a stubbed
 * `vscode` cannot: that the shipped compiler loads through `workspace.fs`, that
 * a real build lands a hex in a real workspace, and that the two hosts' worker
 * routes both work.
 *
 * Every check reports before it asserts, so a failing run says which assumption
 * broke rather than stopping at the first one.
 */
import * as vscode from 'vscode';

import type { ExtensionApi } from '../../src/activate';
import { COMMANDS, OUTPUTS } from '../../src/config';
import { TEMPLATE } from '../../src/project/template';

const EXTENSION_ID = 'carlosperate.bbcmicrobit-cpp';

const failures: string[] = [];

function record(name: string, ok: boolean, detail: string): void {
	if (!ok) failures.push(name);
	console.log(`[test] ${ok ? 'PASS' : 'FAIL'}  ${name}\n[test]       ${detail}`);
}

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

async function exists(uri: vscode.Uri): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(uri);
		return true;
	} catch {
		return false;
	}
}

const remove = (uri: vscode.Uri) => vscode.workspace.fs.delete(uri, { recursive: true }).then(undefined, () => undefined);

export async function run(): Promise<void> {
	const extension = vscode.extensions.getExtension<ExtensionApi>(EXTENSION_ID);
	if (!extension) {
		throw new Error(
			`${EXTENSION_ID} is not loaded. --extensionTestsPath must point inside ` +
				'--extensionDevelopmentPath, or the script runs in a host this extension does not exist in.'
		);
	}
	const root = vscode.workspace.workspaceFolders?.[0]?.uri;
	if (!root) throw new Error('no workspace folder: the bench has to be open');

	const api = await extension.activate();
	await resetBench(root);
	checkTheHostLoadedItsOwnEntry(api);
	await checkContributedCommandsResolve();
	await checkABuildWritesTheHex(root, api);
	await checkAnErrorIsReportedByFileAndLine(root, api);
	await checkUnsavedEditsAreBuilt(root, api);
	await checkTheNewestBuildWins(root, api);
	await checkCreateProject(root);

	summarise();
}

/** A browser bundle loaded by the node host, or the other way round, is a manifest mistake nothing else catches. */
function checkTheHostLoadedItsOwnEntry(api: ExtensionApi): void {
	const isNode = typeof process === 'object' && typeof process.versions?.node === 'string';
	const expected = isNode ? 'node' : 'browser';
	record('the host loaded its own entry point', api.entry === expected, `entry ${api.entry}, host is ${expected}`);
}

async function checkContributedCommandsResolve(): Promise<void> {
	const registered = new Set(await vscode.commands.getCommands(true));
	const missing = Object.values(COMMANDS).filter((id) => !registered.has(id));
	record('every contributed command is registered', missing.length === 0, missing.length ? `missing ${missing.join(', ')}` : Object.values(COMMANDS).join(', '));
}

/**
 * An interrupted earlier run can leave a second `main()` in `new-project/`, which fails the link on
 * duplicate symbols, or a broken `main.cpp`, which is tracked and so would fail the unit suite and
 * dirty the working tree. Restoring rather than only deleting is what makes the bench self-healing.
 */
async function resetBench(root: vscode.Uri): Promise<void> {
	await Promise.all(
		[OUTPUTS.hex, OUTPUTS.map, 'bad.cpp', 'new-project'].map((name) => remove(vscode.Uri.joinPath(root, name)))
	);
	await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(root, 'main.cpp'), new TextEncoder().encode(TEMPLATE));
}

async function checkABuildWritesTheHex(root: vscode.Uri, api: ExtensionApi): Promise<void> {
	const hex = vscode.Uri.joinPath(root, OUTPUTS.hex);
	const map = vscode.Uri.joinPath(root, OUTPUTS.map);

	const started = Date.now();
	await vscode.commands.executeCommand(COMMANDS.build);
	const elapsed = Date.now() - started;

	const last = api.lastBuild();
	if (!last?.ok) {
		record('a build writes MICROBIT.hex', false, `the build did not succeed: ${last?.error ?? last?.output ?? 'no record'}`);
		return;
	}
	const written = await exists(hex) ? decode(await vscode.workspace.fs.readFile(hex)) : '';
	const looksLikeHex = written.startsWith(':') && /:00000001FF\s*$/.test(written) && written.length > 100_000;
	record('a build writes MICROBIT.hex', looksLikeHex, `${written.length} characters in ${elapsed} ms, first build in this host`);
	record('the build writes the link map beside it', await exists(map), map.path);
}

async function checkAnErrorIsReportedByFileAndLine(root: vscode.Uri, api: ExtensionApi): Promise<void> {
	const bad = vscode.Uri.joinPath(root, 'bad.cpp');
	await vscode.workspace.fs.writeFile(bad, new TextEncoder().encode('int main() { nope; }\n'));
	try {
		await vscode.commands.executeCommand(COMMANDS.build);
		const last = api.lastBuild();
		const output = last?.output ?? '';
		record(
			'a broken file fails the build and the output names file, line and column',
			last?.ok === false && /bad\.cpp:1:\d+: error:/.test(output),
			output.split('\n').find((line: string) => line.includes('error:')) ?? `ok=${String(last?.ok)} ${last?.error ?? ''}`
		);
		// A stale hex beside a failed build is the one that gets flashed by mistake.
		record('a failed build removes the previous hex', !(await exists(vscode.Uri.joinPath(root, OUTPUTS.hex))), OUTPUTS.hex);
	} finally {
		await remove(bad);
	}
}

/**
 * A build is of the code on screen, not the last version saved. Only a real editor has a dirty
 * buffer, so this is the one place the behaviour can be shown at all.
 */
async function checkUnsavedEditsAreBuilt(root: vscode.Uri, api: ExtensionApi): Promise<void> {
	const main = vscode.Uri.joinPath(root, 'main.cpp');
	const original = await vscode.workspace.fs.readFile(main);
	try {
		const document = await vscode.workspace.openTextDocument(main);
		const editor = await vscode.window.showTextDocument(document);
		await editor.edit((builder) => builder.insert(new vscode.Position(0, 0), 'this is not C++;\n'));
		if (!document.isDirty) {
			record('Build compiles the editor\'s text, not the file on disk', false, 'the edit did not leave the document dirty');
			return;
		}

		await vscode.commands.executeCommand(COMMANDS.build);
		const output = api.lastBuild()?.output ?? '';
		record(
			'Build compiles the editor\'s text, not the file on disk',
			api.lastBuild()?.ok === false && /main\.cpp:1:\d+: error:/.test(output),
			output.split('\n').find((line: string) => line.includes('error:')) ?? 'the edited buffer compiled clean, so it was not what was built'
		);
		record('Build saved the edited file', !document.isDirty, `isDirty=${String(document.isDirty)} after the build`);
	} finally {
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
		await vscode.workspace.fs.writeFile(main, original);
	}
}

/** Two Builds at once: the first is cancelled, the second writes; both return normally. */
async function checkTheNewestBuildWins(root: vscode.Uri, api: ExtensionApi): Promise<void> {
	const hex = vscode.Uri.joinPath(root, OUTPUTS.hex);
	await remove(hex);

	const started = Date.now();
	await Promise.all([vscode.commands.executeCommand(COMMANDS.build), vscode.commands.executeCommand(COMMANDS.build)]);
	const elapsed = Date.now() - started;

	const last = api.lastBuild();
	record('two overlapping builds settle and the newest writes the hex', last?.ok === true && (await exists(hex)), `${elapsed} ms for both`);
}

async function checkCreateProject(root: vscode.Uri): Promise<void> {
	const folder = vscode.Uri.joinPath(root, 'new-project');
	await remove(folder);
	await vscode.workspace.fs.createDirectory(folder);
	try {
		await vscode.commands.executeCommand(COMMANDS.createProject, folder);
		const main = vscode.Uri.joinPath(folder, 'main.cpp');
		const written = (await exists(main)) ? decode(await vscode.workspace.fs.readFile(main)) : '';
		record('Create Project writes the template main.cpp into the folder it is given', written === TEMPLATE, main.path);

		// Again: the file is kept, not overwritten, and the command still returns.
		await vscode.commands.executeCommand(COMMANDS.createProject, folder);
		const entries = await vscode.workspace.fs.readDirectory(folder);
		record('Create Project leaves an existing main.cpp alone', entries.length === 1 && entries[0][0] === 'main.cpp', entries.map(([name]) => name).join(', '));
	} finally {
		// The command opened the file; deleting it from under an editor logs an error.
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
		await remove(folder);
	}
}

/** Each check already printed itself, so the tail is the verdict, not a second copy of the log. */
function summarise(): void {
	if (failures.length > 0) throw new Error(`failed: ${failures.join('; ')}`);
	console.log('[test] ALL PASSED');
}
