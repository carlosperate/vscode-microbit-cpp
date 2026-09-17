/**
 * Desktop VS Code with this extension loaded from source. Two modes:
 *
 * - no arguments, `npm run desktop`: open the bench interactively, the
 *   counterpart of `npm run chrome`.
 * - `--test`, `npm run test:integration:desktop`: run the integration tests, the
 *   same bundle `npm run test:integration` runs under VS Code Web.
 *
 * Both run a VS Code downloaded into `.vscode-test/` with an extensions
 * directory of their own, so a session is isolated from the machine's own
 * install and no settings of the developer's are read.
 *
 * `--extensionDevelopmentKind` is deliberately not passed: the manifest declares
 * both `main` and `browser`, so desktop picks `main` and runs the node bundle,
 * which is what a real desktop install gets.
 */
import { downloadAndUnzipVSCode, runTests } from '@vscode/test-electron';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// This script lives in config/, but the bench and .vscode-test/ are
// repo-root-relative, so `root` steps back up out of config/.
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const bench = path.join(root, 'test', 'workspace');
const testing = process.argv.includes('--test');
// `engines.vscode` is the floor, and its node is far older than the @types/node
// this compiles against, so a node API newer than it compiles and then throws.
// Only running there catches that: `--vscode-version=1.91.1`.
const versionArgument = process.argv.find((argument) => argument.startsWith('--vscode-version='));
const version = versionArgument?.slice('--vscode-version='.length);
// Other extensions loaded from source beside this one, `--extension=<path>`, repeatable: the
// manager this extension depends on, which VS Code refuses to activate it without.
const alongside = process.argv
	.filter((argument) => argument.startsWith('--extension='))
	.map((argument) => path.resolve(root, argument.slice('--extension='.length)));
const developmentPaths = [root, ...alongside];

/** The limit is on the socket path, so it is the socket that gets measured. */
const SOCKET_LIMIT = 103;

/**
 * Whether VS Code could open its socket inside this directory. The real name
 * carries the running version (`1.99-main.sock`), unknown before launch, so this
 * measures a generous stand-in. Bytes, not characters: the limit is on
 * `sun_path`. Windows uses a named pipe the profile path is not part of.
 */
const fits = (dir) =>
	process.platform === 'win32' || Buffer.byteLength(path.join(dir, '1.9999-main.sock')) <= SOCKET_LIMIT;

/** Where a profile goes when it does not fit, and why it had to move. */
const tooDeep = (dir) =>
	new Error(
		`no room for a VS Code profile: ${dir} exceeds the ${SOCKET_LIMIT}-character socket limit. ` +
			'Set TMPDIR to something shorter.'
	);

/**
 * Where the profile goes. A test run gets a throwaway one, and the two modes
 * never share: the tests write state of their own, and a run interrupted midway
 * would fail the next one before it starts.
 *
 * The interactive profile sits beside the downloaded VS Code, unless the
 * checkout is too deep for the socket limit, in which case it moves to the temp
 * directory under a name derived from the checkout so two clones keep their own
 * settings. Announced, because a profile that silently moved is a setting that
 * silently disappeared.
 */
function userDataDir() {
	if (testing) {
		// Made and then measured, and cleaned up if it does not fit, rather than modelling a
		// stand-in name that has to stay exactly as long as the real one.
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mbcpp-test-'));
		if (fits(dir)) return dir;
		fs.rmSync(dir, { recursive: true, force: true });
		throw tooDeep(dir);
	}

	const beside = path.join(root, '.vscode-test', 'user-data');
	if (fits(beside)) return beside;

	const key = createHash('sha256').update(root).digest('hex').slice(0, 8);
	const elsewhere = path.join(os.tmpdir(), `mbcpp-${key}`);
	if (!fits(elsewhere)) throw tooDeep(elsewhere);
	console.log(`[desktop] ${root} is too deep for a profile beside it, so this session keeps its settings in ${elsewhere}`);
	return elsewhere;
}

/**
 * The Copilot sign-in modal is not covered by `--disable-extensions`: it ships
 * as a builtin, and builtins stay enabled. A setting is the only thing that
 * stops it swallowing keystrokes. Never overwrites, so a change made in a
 * session survives the next launch.
 */
function seedSettings(dir) {
	const settings = path.join(dir, 'User', 'settings.json');
	if (fs.existsSync(settings)) return;
	fs.mkdirSync(path.dirname(settings), { recursive: true });
	fs.writeFileSync(settings, `${JSON.stringify({ 'chat.disableAIFeatures': true }, null, '\t')}\n`);
}

/**
 * Launched from VS Code's own terminal, the inherited VSCODE_* vars reach the child and its webviews
 * then fail to register a service worker. Unsetting rather than filtering serves both callers:
 * `runTests` merges this over `process.env`, and node's spawn omits any key valued `undefined`.
 */
const unsetVscodeVars = Object.fromEntries(
	Object.keys(process.env)
		.filter((key) => key.startsWith('VSCODE_'))
		.map((key) => [key, undefined])
);

const profile = userDataDir();
seedSettings(profile);

// Alongside the user data for a test run, so both are thrown away together.
const extensionsDir = testing ? path.join(profile, 'extensions') : path.join(root, '.vscode-test', 'extensions');

const launchArgs = [
	`--user-data-dir=${profile}`,
	`--extensions-dir=${extensionsDir}`,
	'--skip-welcome',
	'--skip-release-notes',
	'--disable-workspace-trust',
	bench,
];

if (testing) {
	try {
		await runTests({
			...(version ? { version } : {}),
			extensionDevelopmentPath: developmentPaths,
			extensionTestsPath: path.join(root, 'test', 'integration', 'dist', 'index.js'),
			extensionTestsEnv: unsetVscodeVars,
			launchArgs,
		});
	} catch (error) {
		// The tests report their own failures line by line; a stack trace on top only buries them.
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	} finally {
		// Windows holds file handles open for a moment after the window exits.
		fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
	}
} else {
	const executable = await downloadAndUnzipVSCode(version);
	const args = [
		// Absolute: VS Code resolves a relative path here against its own cwd, not
		// the shell's, and then quietly opens a window with no extension in it.
		...developmentPaths.map((developmentPath) => `--extensionDevelopmentPath=${developmentPath}`),
		...launchArgs,
	];
	/**
	 * Exit as the child did. A signal death carries no status, so reporting 0 there would call a
	 * crash a clean run, and 128 plus the signal is what a shell reports: SIGSEGV reads as 139.
	 */
	const exitAs = (status, signal) => process.exit(signal ? 128 + (os.constants.signals[signal] ?? 0) : (status ?? 0));

	spawn(executable, args, { stdio: 'inherit', env: { ...process.env, ...unsetVscodeVars } }).on('exit', exitAs);
}
