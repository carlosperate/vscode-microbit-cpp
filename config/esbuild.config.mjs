import esbuild from 'esbuild';
import { flatten, unpackTar } from 'microbit-clang-wasm-codal';
import { realpathSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// This script lives in config/, but src/ and dist/ are repo-root-relative, so
// `root` steps back up out of config/.
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const require = createRequire(import.meta.url);

// Both package roots, resolved through the one subpath each exports for the purpose, so neither
// depends on where a package happens to keep its entry point.
const packageRoot = (name) => path.dirname(require.resolve(`${name}/package.json`));
const TOOLCHAIN = packageRoot('microbit-clang-wasm');
const CODAL = packageRoot('microbit-clang-wasm-codal');

/** What the two packages were resolved to, which is what the copied files are identified by. */
const versions = ['microbit-clang-wasm', 'microbit-clang-wasm-codal']
	.map((name) => `${name}@${require(`${name}/package.json`).version}`)
	.join(' ');

/**
 * What the extension bundles share. `format: cjs` is what an extension host
 * loads either way, and `vscode` stays external because the host injects it.
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
 * One VSIX carries all four bundles. The host picks an extension bundle,
 * `browser` in a Web Worker or `main` in node, and that bundle starts the
 * matching worker bundle. The paths are a contract with package.json and the
 * two entry points.
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
		{
			...shared,
			entryPoints: [path.join(root, 'src', 'worker', 'browser.ts')],
			outfile: path.join(outDir, 'dist', 'worker.browser.js'),
			platform: 'browser',
			target: 'es2020',
			// A classic script: VS Code starts nested workers through importScripts, which cannot load a module.
			format: 'iife',
			// The toolchain runtime's node-only branch, which a browser never takes.
			external: ['node:*'],
			// The runtime resolves each asset's URL against this before the asset loader sees it,
			// and only the file name survives, so any absolute base will do.
			define: { 'import.meta.url': JSON.stringify('file:///microbit-clang-wasm/') },
			mainFields: ['module', 'browser', 'main'],
		},
		{
			...shared,
			entryPoints: [path.join(root, 'src', 'node', 'worker-entry.ts')],
			outfile: path.join(outDir, 'dist', 'worker.node.mjs'),
			platform: 'node',
			target: 'node18',
			// ESM, so the packages' import.meta.url means something; worker_threads loads .mjs as a module.
			format: 'esm',
			external: [],
			mainFields: ['module', 'main'],
		},
	];
}

/**
 * The compiler, its sysroot and the CODAL payload, copied out of node_modules,
 * which the VSIX leaves out, to where the worker's asset names point.
 *
 * @param {string} outDir
 */
export async function copyAssets(outDir = root) {
	const assets = path.join(outDir, 'dist', 'assets');
	const gen = path.join(TOOLCHAIN, 'gen');
	await mkdir(path.join(assets, 'toolchain'), { recursive: true });
	await mkdir(path.join(assets, 'codal'), { recursive: true });
	for (const name of await readdir(gen)) {
		if (/\.(wasm|tar)$/.test(name)) await copyFile(path.join(gen, name), path.join(assets, 'toolchain', name));
	}
	for (const name of ['manifest.json', 'payload.tar']) {
		await copyFile(path.join(CODAL, 'codal', name), path.join(assets, 'codal', name));
	}
}

/**
 * Every shipped component's own notice, gathered into dist/licenses/ so the
 * attribution page points at files rather than paraphrasing them. The sysroot's
 * notices travel inside the resources tar, so they are unpacked from it.
 *
 * @param {string} outDir
 */
export async function copyLicences(outDir = root) {
	const out = path.join(outDir, 'dist', 'licenses');
	await rm(out, { recursive: true, force: true });
	await mkdir(path.join(out, 'toolchain', 'sysroot'), { recursive: true });
	await mkdir(path.join(out, 'codal'), { recursive: true });
	await copyFile(path.join(TOOLCHAIN, 'LICENSES'), path.join(out, 'toolchain', 'LICENSES'));
	await copyFile(path.join(TOOLCHAIN, 'LICENSE.txt'), path.join(out, 'toolchain', 'LICENSE.txt'));
	await copyFile(path.join(CODAL, 'LICENSES'), path.join(out, 'codal', 'LICENSES'));

	// newlib-nano is the variant the sysroot holds, so its notice set is the right one. Walked in
	// the unpacked tree rather than flattened, which would name all 2,160 entries to keep ten.
	const tar = unpackTar(await readFile(path.join(TOOLCHAIN, 'gen', 'llvm-resources.tar')));
	const notices = flatten(tar.share?.licenses?.['newlib-nano'] ?? {});
	for (const [name, bytes] of Object.entries(notices)) {
		const target = path.join(out, 'toolchain', 'sysroot', name);
		// That notice set happens to be flat; nothing promises the next release's will be.
		await mkdir(path.dirname(target), { recursive: true });
		await writeFile(target, bytes);
	}
}

/**
 * The 124 MB of assets and the notices inside a 35 MB tar are both identified by the two package
 * versions, which are pinned exactly, so one stamp says whether either needs doing again. Without
 * it every one of the six scripts that begin with `npm run build` redid all of it.
 *
 * @param {string} outDir
 */
async function copyOnce(outDir) {
	const stamp = path.join(outDir, 'dist', 'assets', '.versions');
	if ((await readFile(stamp, 'utf8').catch(() => null)) === versions) return;
	await Promise.all([copyAssets(outDir), copyLicences(outDir)]);
	await writeFile(stamp, versions);
}

/** @param {string} [outDir] */
export async function build(outDir = root) {
	await Promise.all([...getBuildOptions(outDir).map((options) => esbuild.build(options)), copyOnce(outDir)]);
}

// pathToFileURL matches what import.meta.url carries on Windows; realpathSync
// matches how node resolves the ESM main, or a symlink silently builds nothing.
if (import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
	await build();
}
