import { describe, expect, it } from 'vitest';

import types from 'vscode-bbcmicrobit-manager-api/package.json';
import { MANAGER_API_VERSION } from '../src/config';
import { isIncompatibleApiError, isManagerApi } from '../src/manager/api';

/** The shape every manager has exported, without the members later versions added. */
const api = () => ({
	version: '0.1.0',
	registerMode: () => ({ dispose() {} }),
	connect: async () => undefined,
	flashHex: async () => true,
	commands: { openTerminal: 'bbcmicrobit-manager.openTerminal' },
});

describe('recognising the manager API', () => {
	it('accepts an object with a version, the calls this extension makes and the terminal id', () => {
		expect(isManagerApi(api())).toBe(true);
	});

	/**
	 * A manager too old for this extension still has this shape, and must be
	 * refused by `registerMode`, which names the extension to update, rather than
	 * here, which would call it missing.
	 */
	it('accepts a manager older than the version this extension declares', () => {
		expect(MANAGER_API_VERSION).not.toBe(api().version);
		expect(isManagerApi(api())).toBe(true);
	});

	it('refuses an object missing any of them', () => {
		for (const member of ['version', 'registerMode', 'connect', 'flashHex', 'commands'] as const) {
			const partial: Record<string, unknown> = api();
			delete partial[member];
			expect(isManagerApi(partial), member).toBe(false);
		}
		expect(isManagerApi({ ...api(), commands: {} })).toBe(false);
	});

	it('refuses anything that is not an object', () => {
		expect(isManagerApi(undefined)).toBe(false);
		expect(isManagerApi(null)).toBe(false);
		expect(isManagerApi('0.1.0')).toBe(false);
	});
});

/**
 * The manager shows its own message for a version mismatch and for nothing else,
 * so this is what decides whether this extension has to speak up instead.
 */
describe('recognising the refusal the manager explains itself', () => {
	it('is the version mismatch, by name, whatever realm it was built in', () => {
		expect(isIncompatibleApiError(Object.assign(new Error('needs a newer manager'), { name: 'IncompatibleApiError' }))).toBe(true);
		expect(isIncompatibleApiError({ name: 'IncompatibleApiError' })).toBe(true);
	});

	it('is not a malformed mode, a taken id, or anything that is not an error', () => {
		expect(isIncompatibleApiError(new TypeError('registerMode: label must be a string'))).toBe(false);
		expect(isIncompatibleApiError(new Error('registerMode: a mode with id "cpp" is already registered'))).toBe(false);
		expect(isIncompatibleApiError('IncompatibleApiError')).toBe(false);
		expect(isIncompatibleApiError(undefined)).toBe(false);
	});
});

/**
 * The version this extension declares is a version of the types package, and
 * the two are bumped by hand in different files.
 */
it('declares the API version of the types it was built against', () => {
	expect(MANAGER_API_VERSION).toBe(types.version);
});
