import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it } from 'vitest';

import { TEMPLATE } from '../src/project/template';

/** Line endings on a Windows checkout can turn them into CRLF. */
const lines = (text: string) => text.split(/\r?\n/);

/** The bench is what every integration run builds, so it has to be the program Create Project writes. */
it('the bench main.cpp is the project template', async () => {
	const bench = await readFile(path.join(__dirname, 'workspace', 'main.cpp'), 'utf8');
	expect(lines(bench)).toEqual(lines(TEMPLATE));
});
