/**
 * What ships is the bundles and the assets beside them, not the source, so these
 * assertions are made against the built output. An import crossing between the
 * hosts fails only at runtime and only on the other host, which is the failure
 * this file exists to turn into a red test.
 */
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';

// @ts-expect-error -- plain .mjs config, no types
import { build } from '../config/esbuild.config.mjs';

// Built here rather than read from dist/, so `npm test` needs no prior build.
let outDir: string;
const bundles: Record<string, string> = {};

const EXTENSION = ['browser.js', 'node.js'];
const WORKERS = ['worker.browser.js', 'worker.node.mjs'];

beforeAll(async () => {
	outDir = await mkdtemp(path.join(tmpdir(), 'microbit-cpp-build-'));
	await build(outDir);
	for (const name of [...EXTENSION, ...WORKERS]) bundles[name] = await readFile(path.join(outDir, 'dist', name), 'utf8');
}, 120_000);

afterAll(async () => {
	await rm(outDir, { recursive: true, force: true });
});

const required = (bundle: string) => [
	...new Set([...bundle.matchAll(/require\(["']([^"']+)["']\)/g)].map((match) => match[1])),
];

it.each(EXTENSION)('%s is CJS, which is what an extension host loads', (which) => {
	expect(bundles[which]).toContain('module.exports');
	expect(bundles[which]).not.toMatch(/^\s*export[\s{]/m);
});

it.each(EXTENSION)('%s exports the two functions VS Code calls', (which) => {
	expect(bundles[which]).toContain('activate');
	expect(bundles[which]).toContain('deactivate');
});

/** The host injects `vscode`; anything else here is a dependency arriving unseen. */
it('the browser extension bundle leaves vscode external and pulls in nothing else at runtime', () => {
	expect(required(bundles['browser.js'])).toEqual(['vscode']);
});

it('the node extension bundle needs only vscode and worker_threads', () => {
	expect(required(bundles['node.js']).sort()).toEqual(['node:worker_threads', 'vscode']);
});

/** The compiler lives in the workers, so neither extension bundle may carry it. */
it.each(EXTENSION)('%s does not carry the compiler', (which) => {
	expect(bundles[which].length).toBeLessThan(100_000);
	expect(bundles[which]).not.toContain('createCodal');
});

/** VS Code starts nested workers through importScripts, which only takes a classic script. */
it('the browser worker is a classic script carrying the compiler', () => {
	const worker = bundles['worker.browser.js'];
	expect(worker).not.toMatch(/^\s*(import|export)[\s{*]/m);
	expect(worker).toContain('createCodal');
	expect(worker).not.toContain('require("vscode")');
});

it('the node worker is an ES module, so the packages\' import.meta.url means something', () => {
	expect(bundles['worker.node.mjs']).toMatch(/^import /m);
	expect(bundles['worker.node.mjs']).toContain('createCodal');
});

/**
 * Node globals compile clean in a Web Worker and throw there. The dotted ones
 * require a property name after the dot, because that is what reading a global
 * looks like and a full stop ending an English sentence is not.
 */
const nodeGlobals = [
	/\bBuffer\s*\.\w/,
	/\b__dirname\b/,
	/\b__filename\b/,
	/\bglobal\.\w/,
	// A worker has timers but not this one, and a bundled dependency reaching for it throws there.
	/\bsetImmediate\s*\(/,
];

it.each(nodeGlobals)('the browser bundles do not reach for %s, which the worker does not have', (pattern) => {
	expect(bundles['browser.js']).not.toMatch(pattern);
	expect(bundles['worker.browser.js']).not.toMatch(pattern);
});

/** The toolchain runtime reads `process` only behind a typeof guard, so the extension bundle alone is held to this. */
it('the browser extension bundle does not reach for process', () => {
	expect(bundles['browser.js']).not.toMatch(/\bprocess\s*\.\w/);
});

/** The budgets Phase 0 set for the compiler payload; every extension update downloads all of it again. */
it('ships the compiler assets where the worker asks for them, inside the size budgets', async () => {
	const assets = path.join(outDir, 'dist', 'assets');
	const size = async (name: string) => (await stat(path.join(assets, name))).size;

	const wasm = await size('toolchain/llvm.core.wasm');
	expect(wasm).toBeLessThanOrEqual(80 * 1024 * 1024);

	const toolchain = wasm + (await size('toolchain/llvm-resources.tar'));
	expect(toolchain).toBeLessThanOrEqual(105 * 1024 * 1024);

	expect(await size('codal/payload.tar')).toBeGreaterThan(1024 * 1024);
	const manifest = JSON.parse(await readFile(path.join(assets, 'codal', 'manifest.json'), 'utf8'));
	expect(manifest.toolchain.version).toBe(JSON.parse(await readFile(path.join(__dirname, '..', 'node_modules', 'microbit-clang-wasm', 'package.json'), 'utf8')).version);
});

it('gathers every shipped component\'s notice beside the assets', async () => {
	const licenses = path.join(outDir, 'dist', 'licenses');
	for (const name of ['toolchain/LICENSES', 'toolchain/LICENSE.txt', 'toolchain/sysroot/COPYING.NEWLIB', 'toolchain/sysroot/COPYING.LIBGLOSS', 'toolchain/sysroot/LIBCXX-LICENSE.txt', 'codal/LICENSES']) {
		expect((await stat(path.join(licenses, name))).size, name).toBeGreaterThan(0);
	}
});
