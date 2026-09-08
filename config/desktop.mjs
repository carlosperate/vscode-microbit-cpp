/**
 * Desktop VS Code with this extension loaded from source, the counterpart of
 * `npm run chrome`. It runs a VS Code downloaded into `.vscode-test/` with an
 * extensions directory of its own, so the session is isolated from the machine's
 * own install and reads none of the developer's settings.
 *
 * `--extensionDevelopmentKind` is deliberately not passed: the manifest declares
 * both `main` and `browser`, so desktop picks `main` and runs the node bundle,
 * which is what a real desktop install gets.
 */
import { downloadAndUnzipVSCode } from '@vscode/test-electron';
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
// `engines.vscode` is the floor, and its node is far older than the @types/node
// this compiles against, so a node API newer than it compiles and then throws.
// Only running there catches that: `--vscode-version=1.91.1`.
const versionArgument = process.argv.find((argument) => argument.startsWith('--vscode-version='));
const version = versionArgument?.slice('--vscode-version='.length);

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

/**
 * The profile sits beside the downloaded VS Code, unless the checkout is too
 * deep for the socket limit, in which case it moves to the temp directory under
 * a name derived from the checkout so two clones keep their own settings.
 * Announced, because a profile that silently moved is a setting that silently
 * disappeared.
 */
function userDataDir() {
	const beside = path.join(root, '.vscode-test', 'user-data');
	if (fits(beside)) return beside;

	const key = createHash('sha256').update(root).digest('hex').slice(0, 8);
	const elsewhere = path.join(os.tmpdir(), `mbcpp-${key}`);
	if (!fits(elsewhere)) {
		throw new Error(
			`no room for a VS Code profile: ${elsewhere} exceeds the ${SOCKET_LIMIT}-character socket limit. ` +
				'Set TMPDIR to something shorter.'
		);
	}
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

/** Launched from VS Code's own terminal, the inherited VSCODE_* vars reach the
 * child and its webviews then fail to register a service worker. */
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('VSCODE_')));

const profile = userDataDir();
seedSettings(profile);

const executable = await downloadAndUnzipVSCode(version);
const args = [
	// Absolute: VS Code resolves a relative path here against its own cwd, not
	// the shell's, and then quietly opens a window with no extension in it.
	`--extensionDevelopmentPath=${root}`,
	`--user-data-dir=${profile}`,
	`--extensions-dir=${path.join(root, '.vscode-test', 'extensions')}`,
	'--skip-welcome',
	'--skip-release-notes',
	'--disable-workspace-trust',
	bench,
];

// A signal death carries no status, and exiting 0 there would report a crash as a clean run.
spawn(executable, args, { stdio: 'inherit', env: cleanEnv() }).on('exit', (status, signal) =>
	process.exit(status ?? (signal ? 1 : 0))
);
