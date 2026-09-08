import esbuild from 'esbuild';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// This script lives in config/, but src/ and dist/ are repo-root-relative, so
// `root` steps back up out of config/.
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

/**
 * What both bundles share. `format: cjs` is what an extension host loads either
 * way, and `vscode` stays external because the host injects it.
 */
const shared = {
	bundle: true,
	format: 'cjs',
	external: ['vscode'],
	// Never shipped: .vscodeignore drops every .map from the VSIX.
	sourcemap: true,
	logLevel: 'warning',
	absWorkingDir: root,
};

/**
 * One VSIX carries both extension bundles and the host picks: `browser` in a Web
 * Worker, `main` in node. Those paths are a contract with those two fields in
 * package.json.
 *
 * @param {string} outDir directory to build into
 * @returns {import('esbuild').BuildOptions[]}
 */
export function getBuildOptions(outDir = root) {
	return [
		{
			...shared,
			entryPoints: [path.join(root, 'src', 'browser', 'extension.ts')],
			outfile: path.join(outDir, 'dist', 'browser.js'),
			platform: 'browser',
			target: 'es2020',
			// Prefer `module` over `browser`: a UMD `browser` build assigns to
			// `global`, which the Web Worker doesn't have.
			mainFields: ['module', 'browser', 'main'],
		},
		{
			...shared,
			entryPoints: [path.join(root, 'src', 'node', 'extension.ts')],
			outfile: path.join(outDir, 'dist', 'node.js'),
			platform: 'node',
			// The oldest node any editor meeting `engines.vscode` runs its host on.
			target: 'node18',
			// `module` ahead of node's own default, so both bundles get the same
			// build of a dependency.
			mainFields: ['module', 'main'],
		},
	];
}

/** @param {string} [outDir] */
export async function build(outDir) {
	await Promise.all(getBuildOptions(outDir).map((options) => esbuild.build(options)));
}

// pathToFileURL matches what import.meta.url carries on Windows; realpathSync
// matches how node resolves the ESM main, or a symlink silently builds nothing.
if (import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
	await build();
}
