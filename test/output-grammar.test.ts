import { expect, it } from 'vitest';

import grammar from '../syntaxes/output.tmLanguage.json';

/** The scope a line gets: the first pattern matching it whole, as each one is anchored at both ends. */
const scopeOf = (line: string) => grammar.patterns.find((pattern) => new RegExp(pattern.match).test(line))?.name ?? null;

it('colours the log by what each line is', () => {
	const lines: [string, string | null][] = [
		["source/main.cpp:3:5: error: use of undeclared identifier 'oops'", 'token.error-token'],
		['source/main.cpp:1:10: fatal error: \'missing.h\' file not found', 'token.error-token'],
		['ld.lld: error: undefined symbol: missing()', 'token.error-token'],
		['Build failed after 8.0 s: clang++ exited with 1', 'token.error-token'],
		['clang++ codal-microbit-v2/model/MicroBit.cpp: exit code 1', 'token.error-token'],
		['codal/libraries/codal-core/inc/core/Pin.h:9:5: warning: unused parameter [-Wunused-parameter]', 'token.warn-token'],
		["./codal/codal_extra_definitions.h:3:36: note: expanded from macro 'SCHEDULER_TICK_PERIOD_US'", 'token.info-token'],
		['Build succeeded in 0.6 s: MICROBIT.hex written, 752986 bytes', 'markup.inserted'],
		['Running bbcmicrobit-cpp.build', 'token.debug-token'],
		['Building mount, 1 file', 'token.debug-token'],
		['Compiling CODAL for the settings in codal.json, 203 steps: about 15 to 30 seconds', 'token.debug-token'],
		['  clang++ -Icodal/libraries -c project/source/main.cpp -o build/user/0-main.cpp.obj', 'comment.line'],
		['      |                                 ^~~~~~~~~~~~~~~~~~~~~~~~', 'markup.inserted'],
		// The rest is left as it is: a file's line, Clang's excerpt and its closing count.
		['clang++ source/main.cpp', null],
		['  443 |     static int timeout = 500 / (SCHEDULER_TICK_PERIOD_US/1000);', null],
		// The user's own code, quoted, even when it reads like a diagnostic.
		['   12 |     printf("error: %d\\n", code); // note: upload failed: retry', null],
		['46 warnings and 1 error generated.', null],
	];
	expect(lines.map(([line]) => [line, scopeOf(line)])).toEqual(lines);
});
