/**
 * What ships is the bundles, not the source, so these assertions are made
 * against the built bytes. An import crossing between the two entry points fails
 * only at runtime and only on the other host, which is the failure this file
 * exists to turn into a red test.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';

// @ts-expect-error -- plain .mjs config, no types
import { build } from '../config/esbuild.config.mjs';

// Built here rather than read from dist/, so `npm test` needs no prior build.
let outDir: string;
let browser: string;
let node: string;

beforeAll(async () => {
	outDir = await mkdtemp(path.join(tmpdir(), 'microbit-cpp-build-'));
	await build(outDir);
	const read = (name: string) => readFile(path.join(outDir, 'dist', name), 'utf8');
	[browser, node] = await Promise.all([read('browser.js'), read('node.js')]);
}, 60_000);

afterAll(async () => {
	await rm(outDir, { recursive: true, force: true });
});

/** Read inside a test, never at collection: nothing is built until `beforeAll`. */
const bundleFor = (which: string) => (which === 'browser' ? browser : node);
const BOTH = ['browser', 'node'];

const required = (bundle: string) => [
	...new Set([...bundle.matchAll(/require\(["']([^"']+)["']\)/g)].map((match) => match[1])),
];

it.each(BOTH)('%s is CJS, which is what an extension host loads', (which) => {
	expect(bundleFor(which)).toContain('module.exports');
	expect(bundleFor(which)).not.toMatch(/^\s*export[\s{]/m);
});

it.each(BOTH)('%s exports the two functions VS Code calls', (which) => {
	expect(bundleFor(which)).toContain('activate');
	expect(bundleFor(which)).toContain('deactivate');
});

/** The host injects `vscode`; anything else here is a dependency arriving unseen. */
it.each(BOTH)('%s leaves vscode external and pulls in nothing else at runtime', (which) => {
	expect(required(bundleFor(which))).toEqual(['vscode']);
});

/**
 * Node globals compile clean in a Web Worker and throw there. The dotted ones
 * require a property name after the dot, because that is what reading a global
 * looks like and a full stop ending an English sentence is not.
 */
const nodeGlobals = [/\bprocess\s*\.\w/, /\bBuffer\s*\.\w/, /\b__dirname\b/, /\b__filename\b/, /\bglobal\.\w/];

it.each(nodeGlobals)('the browser bundle does not reach for %s, which the worker does not have', (pattern) => {
	expect(browser).not.toMatch(pattern);
});
