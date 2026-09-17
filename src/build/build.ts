/**
 * The Build command: a workspace folder in, MICROBIT.hex beside its sources
 * out, and the compiler's own words in the output channel.
 */
import * as vscode from 'vscode';

import { OUTPUTS, PRODUCT, SECTION, SETTINGS } from '../config';
import { isAbsent } from '../fs';
import { log, logRaw, showLog } from '../log';
import { MAX_FILES, SOURCE, SOURCE_GLOB, UNSUPPORTED, excludeGlob, isInside, relativeTo } from './collect';
import { BuildError, type Compiler } from './compiler';
import { pickFolder } from './folder';
import type { BuildOutcome, Files, StepReport } from './protocol';
import { BuildRuns, type Run } from './runs';

/** What the last build did, for the integration tests. */
export interface BuildRecord {
	ok: boolean;
	/** Everything the tools wrote, gathered from the steps as they arrived. */
	output: string;
	error: string | null;
}

/**
 * The hex, or none. Every ending without one has been announced or was the
 * user's own cancel, except `superseded`: a newer build took the outputs over,
 * and it speaks for itself but not for whoever was waiting on this one.
 */
export type BuildResult = { hex: string } | { hex: undefined; superseded: boolean };

export interface Builds {
	/**
	 * `quiet` is for a caller that reports success itself; a failure is still
	 * announced, since only this side knows what went wrong.
	 */
	build(options?: { quiet?: boolean }): Promise<BuildResult>;
	last(): BuildRecord | undefined;
}

const NO_HEX: BuildResult = { hex: undefined, superseded: false };
const SUPERSEDED: BuildResult = { hex: undefined, superseded: true };

const ENCODER = new TextEncoder();

/** A build only counts as done when it produced a hex to write. */
const succeeded = (outcome: BuildOutcome): boolean => outcome.ok && outcome.hex !== null;

const took = (started: number) => `${((Date.now() - started) / 1000).toFixed(1)} s`;

export function createBuild(compiler: Compiler): Builds {
	const runs = new BuildRuns();
	let last: BuildRecord | undefined;

	/**
	 * The build itself, which writes nothing. Null means there was nothing to build or the user
	 * cancelled, so the caller invalidates the outputs rather than publishing any.
	 */
	async function attempt(
		folder: vscode.WorkspaceFolder,
		run: Run,
		onStep: (step: StepReport) => void
	): Promise<BuildOutcome | null> {
		// A part-finished save leaves the sources in a state nothing on disk describes.
		if (!(await saveEdits(folder))) return null;
		const files = await collect(folder);
		if (!files) return null;

		log(`Building ${folder.name}, ${Object.keys(files).length} files`);
		const outcome = await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: `${PRODUCT}: building ${folder.name}`,
				cancellable: true,
			},
			(progress, token) => {
				token.onCancellationRequested(run.cancel);
				return compiler.build(files, {
					signal: run.signal,
					onStep: (step) => {
						report(step);
						onStep(step);
						progress.report({ message: step.tool });
					},
				});
			}
		);

		// A cancelled build must not publish, even when it finished before the cancel arrived.
		if (run.signal.aborted) {
			log('Build cancelled');
			return null;
		}
		return outcome;
	}

	async function build({ quiet = false }: { quiet?: boolean } = {}): Promise<BuildResult> {
		const folder = await pickFolder();
		if (!folder) {
			// Dismissing the folder pick is an answer, not a mistake, so only an empty window is told
			// to open something.
			if ((vscode.workspace.workspaceFolders ?? []).length === 0) {
				void vscode.window.showErrorMessage(`${PRODUCT}: open the folder that holds main.cpp, then run Build.`);
			}
			return NO_HEX;
		}

		const run = runs.start(folder.uri.toString());
		const started = Date.now();
		let output = '';
		try {
			const outcome = await attempt(folder, run, (step) => {
				output += step.stderr;
			});
			const published = await settle(run, folder, outcome, started);
			// Publishing only says this build's work ran: a newer build can start while it writes.
			if (!published || !run.owns()) {
				log(`Build superseded by a newer one; ${published ? 'the newer build replaces what it wrote' : 'its outputs were not written'}`);
				return SUPERSEDED;
			}
			if (!outcome) return NO_HEX; // nothing was built, and the outputs are already invalidated

			last = { ok: succeeded(outcome), output, error: null };
			announce(folder, outcome, started, quiet);
			return outcome.hex !== null && succeeded(outcome) ? { hex: outcome.hex } : NO_HEX;
		} catch (error) {
			const aborted = error instanceof BuildError && error.aborted;
			const message = error instanceof Error ? error.message : String(error);
			log(aborted ? 'Build cancelled' : `Build failed after ${took(started)}: ${message}`);
			if (!(await settle(run, folder, null, started)) || !run.owns()) return SUPERSEDED;
			if (aborted) return NO_HEX;

			last = { ok: false, output, error: message };
			showLog();
			void vscode.window.showErrorMessage(`${PRODUCT}: build failed. ${message}`);
			return NO_HEX;
		} finally {
			run.finish();
		}
	}

	return { build, last: () => last };
}

/**
 * The one place a folder's outputs change. The newest build writes its hex;
 * every other ending removes what an earlier build left, so the hex beside the
 * sources always describes them. False when a newer build owns the outputs now.
 */
function settle(
	run: Run,
	folder: vscode.WorkspaceFolder,
	outcome: BuildOutcome | null,
	started: number
): Promise<boolean> {
	return run.publish(() => (outcome && succeeded(outcome) ? write(folder, outcome, started) : invalidate(folder)));
}

async function write(folder: vscode.WorkspaceFolder, outcome: BuildOutcome, started: number): Promise<void> {
	const bytes = ENCODER.encode(outcome.hex ?? '');
	await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(folder.uri, OUTPUTS.hex), bytes);
	// An older map left beside a new hex would describe a different binary.
	const map = vscode.Uri.joinPath(folder.uri, OUTPUTS.map);
	if (outcome.map !== null) await vscode.workspace.fs.writeFile(map, ENCODER.encode(outcome.map));
	else await remove(map);
	log(`Build succeeded in ${took(started)}: ${OUTPUTS.hex} written, ${bytes.byteLength} bytes`);
}

/** A stale hex beside sources it does not match is the one that gets flashed by mistake. */
async function invalidate(folder: vscode.WorkspaceFolder): Promise<void> {
	for (const name of [OUTPUTS.hex, OUTPUTS.map]) await remove(vscode.Uri.joinPath(folder.uri, name));
}

async function remove(uri: vscode.Uri): Promise<void> {
	try {
		await vscode.workspace.fs.delete(uri);
	} catch (error) {
		// Absent is the ordinary case. Anything else means a stale file may still be sitting there.
		if (!isAbsent(error)) log(`Could not remove ${uri.path}: ${String(error)}`);
	}
}

function announce(folder: vscode.WorkspaceFolder, outcome: BuildOutcome, started: number, quiet: boolean): void {
	if (succeeded(outcome)) {
		if (quiet) return;
		void vscode.window
			.showInformationMessage(`${PRODUCT}: ${OUTPUTS.hex} written to ${folder.name} in ${took(started)}.`, 'Show Output')
			.then((choice) => choice && showLog());
		return;
	}
	const failed = outcome.lastStep;
	log(`Build failed after ${took(started)}: ${failed?.tool ?? 'the build'} exited with ${failed?.exitCode ?? 'an error'}`);
	showLog();
	void vscode.window.showErrorMessage(`${PRODUCT}: build failed, see the output for the errors.`);
}

/**
 * The user means the code they can see, not the last version they saved. Only
 * this folder's documents, so a dirty file elsewhere in the window is left alone.
 */
async function saveEdits(folder: vscode.WorkspaceFolder): Promise<boolean> {
	const dirty = vscode.workspace.textDocuments.filter(
		(document) => document.isDirty && isInside(folder.uri, document.uri)
	);
	if (dirty.length === 0) return true;

	const saved = await Promise.all(dirty.map((document) => document.save()));
	if (saved.every(Boolean)) {
		log(`Saved ${dirty.length} edited file${dirty.length === 1 ? '' : 's'} before building`);
		return true;
	}
	void vscode.window.showErrorMessage(`${PRODUCT}: could not save every edited file in ${folder.name}, so Build stopped.`);
	return false;
}

/** Every C++ file under the folder, or null after saying why there is nothing to build. */
async function collect(folder: vscode.WorkspaceFolder): Promise<Files | null> {
	const own = vscode.workspace.getConfiguration(SECTION, folder.uri).get<unknown>(SETTINGS.buildExclude);
	const shared = vscode.workspace.getConfiguration('files', folder.uri).get<unknown>('exclude');
	const { glob, unsupported } = excludeGlob(own, shared);
	if (unsupported.length) log(`Excludes a single glob cannot hold, ignored: ${unsupported.join(', ')}`);
	const uris = await vscode.workspace.findFiles(
		new vscode.RelativePattern(folder, SOURCE_GLOB),
		glob === null ? null : new vscode.RelativePattern(folder, glob),
		MAX_FILES + 1
	);

	if (uris.length > MAX_FILES) {
		void vscode.window.showErrorMessage(
			`${PRODUCT}: more than ${MAX_FILES} C++ files in ${folder.name}. Is this the right folder? ` +
				`Narrow it with the ${SECTION}.${SETTINGS.buildExclude} setting.`
		);
		return null;
	}
	// Refused here rather than by the compiler, which would first read 94 MB of assets to say the
	// same thing, and could not name the files.
	const refused = uris.filter((uri) => UNSUPPORTED.test(uri.path)).map((uri) => uri.path.split('/').pop());
	if (refused.length > 0) {
		void vscode.window.showErrorMessage(
			`${PRODUCT}: only C++ can be built yet, so ${refused.join(', ')} cannot go in this program.`
		);
		return null;
	}
	if (!uris.some((uri) => SOURCE.test(uri.path))) {
		void vscode.window.showErrorMessage(
			`${PRODUCT}: no C++ source (.cpp) in ${folder.name}. Run "Create Project" to start one.`
		);
		return null;
	}

	// `findFiles` promises no order, and the recipe links the objects in the order it is handed.
	const named = uris
		.map((uri) => {
			const name = relativeTo(folder.uri.path, uri.path);
			if (name === null) throw new Error(`${uri.path} is not inside ${folder.uri.path}`);
			return { uri, name };
		})
		.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
	const contents = await Promise.all(named.map(({ uri }) => vscode.workspace.fs.readFile(uri)));

	const files: Files = {};
	named.forEach(({ name }, index) => {
		files[name] = contents[index];
	});
	return files;
}

/** One line per tool, the full command only when it failed, then whatever the tool said. */
function report(step: StepReport): void {
	const subject = step.args.find((arg) => SOURCE.test(arg))?.split('/').pop() ?? '';
	if (step.exitCode === 0) log(`${step.tool} ${subject}`.trimEnd());
	else log(`${step.tool} ${subject}: exit code ${step.exitCode}\n  ${[step.tool, ...step.args].join(' ')}`);
	if (step.stderr) logRaw(step.stderr);
}
