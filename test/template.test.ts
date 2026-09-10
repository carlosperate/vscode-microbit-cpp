import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it } from 'vitest';

import { TEMPLATE } from '../src/project/template';

/** The bench is what every integration run builds, so it has to be the program Create Project writes. */
it('the bench main.cpp is the project template', async () => {
	const bench = await readFile(path.join(__dirname, 'workspace', 'main.cpp'), 'utf8');
	expect(bench).toBe(TEMPLATE);
});
