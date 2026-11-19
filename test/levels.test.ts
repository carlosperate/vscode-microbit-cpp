import { expect, it } from 'vitest';

import { DEFAULT_DEBUG_LEVEL, debugLevelOf } from '../src/build/levels';

it('reads a level from the setting, -O0 by default', () => {
	expect(DEFAULT_DEBUG_LEVEL).toBe('-O0');
	expect(debugLevelOf('-Og')).toBe('-Og');
});

it('gives the default for anything that is not a level', () => {
	for (const value of [undefined, null, '', '-O9', 'O1', 'toString', 1, ['-O1']]) expect(debugLevelOf(value)).toBe(DEFAULT_DEBUG_LEVEL);
});
