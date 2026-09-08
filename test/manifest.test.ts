import { describe, expect, it } from 'vitest';

import manifest from '../package.json';
import { COMMANDS, PRODUCT, SECTION } from '../src/config';

/**
 * VS Code reads the manifest and the code reads `src/config.ts`, so a command id
 * that exists in only one of them registers nothing and says nothing. This is
 * the check that turns that into a red test.
 */
const contributed = manifest.contributes.commands;

describe('the manifest and the code agree', () => {
	it('contributes every command the code registers', () => {
		expect(contributed.map((command) => command.command).sort()).toEqual(Object.values(COMMANDS).sort());
	});

	it('files every command under the product name', () => {
		for (const command of contributed) expect(command.category).toBe(PRODUCT);
	});

	it('prefixes every command with the settings section, so ids cannot collide', () => {
		for (const command of contributed) expect(command.command.startsWith(`${SECTION}.`)).toBe(true);
	});

	it('names the product the same way in the manifest', () => {
		expect(manifest.displayName).toBe(PRODUCT);
	});
});

/** The two entry points are a contract with `config/esbuild.config.mjs`. */
it('points both hosts at the bundles esbuild writes', () => {
	expect(manifest.browser).toBe('./dist/browser.js');
	expect(manifest.main).toBe('./dist/node.js');
});
