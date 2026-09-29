import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it } from 'vitest';

import { CODAL_JSON, FILES, TEMPLATE } from '../src/project/template';

/** Line endings on a Windows checkout can turn them into CRLF. */
const lines = (text: string) => text.split(/\r?\n/);

const bench = (file: string) => readFile(path.join(__dirname, 'workspace', file), 'utf8');

/** The bench is what every integration run builds, so it has to be the project Create Project writes. */
it('the bench is the project template, file for file', async () => {
	expect(lines(await bench(FILES.main))).toEqual(lines(TEMPLATE));
	expect(lines(await bench(FILES.codalJson))).toEqual(lines(CODAL_JSON));
});

/** Nothing reads codal.json yet, so all it can do is state the configuration the prebuilt CODAL has. */
it('the default codal.json names the CODAL the recipe package ships', async () => {
	const recipe = JSON.parse(
		await readFile(path.join(__dirname, '..', 'node_modules', 'microbit-clang-wasm-codal', 'package.json'), 'utf8')
	);
	const written = JSON.parse(CODAL_JSON);
	expect(written.target).toEqual(recipe.codal.codalJson.target);
	expect(written.config).toEqual({ MICROBIT_BLE_ENABLED: 0, MICROBIT_BLE_PAIRING_MODE: 0 });
});
