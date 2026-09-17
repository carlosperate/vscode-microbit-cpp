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

import type { BoardInfo, HexSource, MicrobitManagerApi } from 'vscode-bbcmicrobit-manager-api';

import type { ExtensionApi } from '../../src/activate';
import type { BuildResult } from '../../src/build/build';
import { flash } from '../../src/build/flash';
import { COMMANDS, EXTENSION_ID, MANAGER_EXTENSION, MODE_ID, OUTPUTS, VIEW_ID } from '../../src/config';
import { isManagerApi } from '../../src/manager/api';
import { TEMPLATE } from '../../src/project/template';
import manifest from '../../package.json';

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
	await checkTheManagerAcceptedTheMode(api);
	await checkABuildWritesTheHex(root, api);
	await checkAnErrorIsReportedByFileAndLine(root, api);
	await checkUnsavedEditsAreBuilt(root, api);
	await checkTheNewestBuildWins(root, api);
	await checkAFlashHandsTheManagerWhatItBuilt(api);
	await checkAV1IsRefusedRatherThanFlashed(api);
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
 * The seam the split creates, and the only place it can be seen: the manager is
 * another extension, so the buttons in the panel are strings in a manifest until
 * a real one is loaded beside this and accepts the mode.
 */
async function checkTheManagerAcceptedTheMode(api: ExtensionApi): Promise<void> {
	const manager = vscode.extensions.getExtension(MANAGER_EXTENSION);
	if (!manager) {
		record(
			'the manager extension is loaded beside this one',
			false,
			`${MANAGER_EXTENSION} is not loaded. The harness unpacks it into .vscode-test/manager and passes that folder to both hosts.`
		);
		return;
	}

	let exported: unknown;
	try {
		exported = await manager.activate();
	} catch (error) {
		record('the manager extension activates', false, `activate() threw: ${String(error)}`);
		return;
	}
	record(
		"the manager's exports are the API this extension was built against",
		isManagerApi(exported),
		isManagerApi(exported) ? `version ${exported.version}` : `exports=${typeof exported}`
	);
	if (!isManagerApi(exported)) return;

	record(
		'the manager accepted the mode',
		api.manager.registered,
		`registered=${String(api.manager.registered)}${api.manager.problem ? `, problem: ${api.manager.problem}` : ''}`
	);
	record(
		'this mode is the active one in a workspace of C++ files',
		exported.activeMode() === MODE_ID,
		`activeMode()=${String(exported.activeMode())}`
	);
	checkTheButtonsRunRealCommands(exported);
}

/**
 * Welcome content is markdown, so the manager's command id is spelled out in our
 * manifest and nothing but this compares it with the id the API publishes. A
 * wrong one is a button that does nothing at all.
 */
function checkTheButtonsRunRealCommands(manager: MicrobitManagerApi): void {
	const welcome = manifest.contributes.viewsWelcome.filter((entry) => entry.view === VIEW_ID);
	const linked = welcome.flatMap((entry) => [...entry.contents.matchAll(/\(command:([^)]+)\)/g)].map((match) => match[1]));
	const ours = new Set<string>(Object.values(COMMANDS));
	const theirs = new Set<string>(Object.values(manager.commands));
	const unknown = linked.filter((command) => !ours.has(command) && !theirs.has(command));
	record(
		'every button in the panel runs a command one of the two extensions publishes',
		linked.length > 0 && unknown.length === 0,
		unknown.length ? `unknown: ${unknown.join(', ')}` : linked.join(', ')
	);
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

	const last = api.builds.last();
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
		const last = api.builds.last();
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
		const output = api.builds.last()?.output ?? '';
		record(
			'Build compiles the editor\'s text, not the file on disk',
			api.builds.last()?.ok === false && /main\.cpp:1:\d+: error:/.test(output),
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

	const last = api.builds.last();
	record('two overlapping builds settle and the newest writes the hex', last?.ok === true && (await exists(hex)), `${elapsed} ms for both`);

	// Called directly, since a command drops the result: Flash is the caller that needs to know.
	const [older, newer] = await Promise.all([api.builds.build({ quiet: true }), api.builds.build({ quiet: true })]);
	record(
		'the older of two overlapping builds says a newer one took over, and the newer hands back the hex',
		older.hex === undefined && older.superseded && newer.hex !== undefined,
		`older: ${summariseResult(older)}; newer: ${summariseResult(newer)}`
	);
}

const summariseResult = (result: BuildResult) =>
	result.hex === undefined ? `no hex, superseded=${String(result.superseded)}` : `${result.hex.length} characters`;

/**
 * The cross-extension seam, from this side: Flash builds and hands the hex back
 * with the board `connect()` answered as `expect`. The manager's half is
 * stubbed, since the real `connect()` ends at a device chooser on web and a
 * drive search on desktop, neither of which a headless run can answer.
 */
async function checkAFlashHandsTheManagerWhatItBuilt(api: ExtensionApi): Promise<void> {
	const name = 'Flash builds the project and hands the manager the hex with the board as expect';
	const board: BoardInfo = { version: 'V2', serialNumber: 'integration-test' };
	let connects = 0;
	let received: { hex: HexSource; expect: BoardInfo | undefined } | undefined;

	const manager = linkTo({
		connect: () => {
			connects += 1;
			return Promise.resolve(board);
		},
		flashHex: (hex, options) => {
			received = { hex, expect: options?.expect };
			return Promise.resolve(true);
		},
	});

	try {
		await flash(manager, api.builds)();
	} catch (error) {
		record(name, false, `Flash threw: ${String(error)}`);
		return;
	}

	const hex = typeof received?.hex === 'string' ? received.hex : undefined;
	record(
		name,
		connects === 1 && hex !== undefined && hex.startsWith(':') && received?.expect === board,
		`connect() called ${connects} time(s), flashHex got ${hex ? `${hex.length} characters` : 'nothing'}, ` +
			`expect ${received?.expect === board ? 'is the board connect() answered' : JSON.stringify(received?.expect)}`
	);
}

/** CODAL builds for a V2, and the manager writes a plain hex to whatever answered, so this side has to refuse. */
async function checkAV1IsRefusedRatherThanFlashed(api: ExtensionApi): Promise<void> {
	let flashes = 0;
	const manager = linkTo({
		connect: () => Promise.resolve({ version: 'V1', serialNumber: 'integration-test' }),
		flashHex: () => {
			flashes += 1;
			return Promise.resolve(true);
		},
	});

	await flash(manager, api.builds)();
	record('a micro:bit V1 is refused rather than flashed with a V2 image', flashes === 0, `flashHex called ${flashes} time(s)`);
}

/** A manager whose board calls are the stub's and whose everything else is unused. */
const linkTo = (half: Partial<MicrobitManagerApi>) => ({
	api: () => half as MicrobitManagerApi,
	status: { registered: true, problem: undefined },
});

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
