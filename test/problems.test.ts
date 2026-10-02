import { describe, expect, it } from 'vitest';

import type { Diagnostic, DiagnosticNote, OtherOutput } from 'microbit-clang-wasm-codal';

import { firstError, problemsOf, shownOutput } from '../src/build/problems';
import type { Files, StepReport } from '../src/build/protocol';

const MAIN = '#define Button 42\n#include "MicroBit.h"\nint main() {\n    const char *s = "héllo 🙂"; int x = oops;\n    missing();\n}\n';
const FILES: Files = { 'source/main.cpp': new TextEncoder().encode(MAIN) };
const LINES = MAIN.split('\n');

const error = (fields: Partial<Diagnostic>): Diagnostic => ({
	severity: 'error',
	file: null,
	line: null,
	column: null,
	message: 'm',
	flag: null,
	notes: [],
	includedFrom: [],
	text: '',
	...fields,
});
const note = (file: string, line: number, column: number | null, message = 'n'): DiagnosticNote => ({ file, line, column, message });
const step = (...diagnostics: (Diagnostic | OtherOutput)[]): StepReport => ({ source: null, tool: 'clang++', args: [], exitCode: 1, stderr: '', diagnostics, codal: null });
const placed = (steps: StepReport[], files = FILES) => problemsOf(steps, files).placed;
const INCLUDED = [{ file: 'codal/inc/MicroBit.h', line: 28 }, { file: 'source/main.cpp', line: 2 }];

describe('problemsOf', () => {
	it('puts an error in the user\'s file at its column, counted in UTF-16 rather than bytes', () => {
		const [problem] = placed([step(error({ file: 'source/main.cpp', line: 4, column: 44 }))]);

		// Clang's 44 counts é as two bytes and the emoji as four; VS Code counts them as one and two.
		expect(problem).toMatchObject({ file: 'source/main.cpp', line: 3, start: LINES[3].indexOf('oops'), end: LINES[3].indexOf('oops') });
	});

	it('moves a header\'s error to the user\'s note, else to their #include, saying where it was', () => {
		const viaMacro = error({ file: 'codal/inc/TouchButton.h', line: 64, column: 32, message: 'expected class name', notes: [note('source/main.cpp', 1, 16)], includedFrom: INCLUDED });
		const viaInclude = error({ file: 'codal/inc/Button.h', line: 41, column: 5, message: 'anonymous class', includedFrom: INCLUDED });
		const [macro, include] = placed([step(viaMacro, viaInclude)]);

		expect(macro).toMatchObject({ line: 0, start: 15, message: 'expected class name (TouchButton.h:64)', related: [] });
		expect(include).toMatchObject({ line: 1, start: 0, end: LINES[1].length, message: 'anonymous class (Button.h:41)' });
	});

	it('keeps one entry per position a header\'s errors move to, as a broken header cascades', () => {
		const cascade = [41, 42, 43].map((line) => error({ file: 'codal/inc/Button.h', line, column: 1, includedFrom: INCLUDED }));

		expect(placed([step(...cascade)])).toHaveLength(1);
	});

	it('shows the same error once when two sources include the header it is in', () => {
		const files: Files = { ...FILES, 'source/util.h': new TextEncoder().encode('int f() { return nope; }\n') };
		const twice = error({ file: 'source/util.h', line: 1, column: 18 });

		expect(placed([step(twice), step({ ...twice })], files)).toHaveLength(1);
	});

	it('links notes in the user\'s files and writes the others into the message', () => {
		const [problem] = placed([
			step(error({ file: 'source/main.cpp', line: 4, column: 5, notes: [note('source/main.cpp', 3, 5, 'here'), note('codal/inc/MicroBitDisplay.h', 150, 10, 'candidate')] })),
		]);

		expect(problem.message).toBe('m\nMicroBitDisplay.h:150: candidate');
		expect(problem.related).toEqual([{ file: 'source/main.cpp', line: 2, start: 4, end: 4, message: 'here' }]);
	});

	it('puts a link error on the whole line of its first reference in the user\'s files', () => {
		const undefinedSymbol = error({
			message: 'undefined symbol: missing()',
			notes: [note('source/main.cpp', 5, null, 'referenced here'), note('source/main.cpp', 4, null, 'referenced here')],
		});
		const [problem] = placed([step(undefinedSymbol)]);

		expect(problem).toMatchObject({ line: 4, start: 4, end: LINES[4].length, message: 'undefined symbol: missing()' });
		expect(problem.related.map((related) => related.line)).toEqual([3]);
	});

	it('keeps two link errors that land on the same line, since they are not one header cascading', () => {
		const undefinedSymbol = (name: string) => error({ message: `undefined symbol: ${name}`, notes: [note('source/main.cpp', 5, null, 'referenced here')] });

		expect(placed([step(undefinedSymbol('a()'), undefinedSymbol('b()'))]).map((problem) => problem.message)).toEqual([
			'undefined symbol: a()',
			'undefined symbol: b()',
		]);
	});

	it('leaves out a byte-order mark, which Clang counts into the first line\'s columns', () => {
		const files: Files = { 'source/main.cpp': new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('int main() { return x; }\n')]) };
		const [problem] = placed([step(error({ file: 'source/main.cpp', line: 1, column: 24 }))], files);

		expect(problem.start).toBe('int main() { return x; }'.indexOf('x'));
	});

	it('counts a byte that is not UTF-8 as the one character VS Code shows for it', () => {
		const encode = (text: string) => new TextEncoder().encode(text);
		const bytes = new Uint8Array([...encode('int f() {\n    const char *s = "'), 0xe9, ...encode('"; int x = oops;\n}\n')]);
		const line = new TextDecoder().decode(bytes).split('\n')[1];
		const [problem] = placed([step(error({ file: 'source/main.cpp', line: 2, column: 'const char *s = "'.length + 4 + 1 + '"; int x = '.length + 1 }))], { 'source/main.cpp': bytes });

		expect(problem.start).toBe(line.indexOf('oops'));
	});

	it('treats line 0, which a `#line 0` gives, as no place, keeping the message', () => {
		const found = problemsOf([step(error({ file: 'source/main.cpp', line: 0, column: 1, message: 'zero' }))], FILES);

		expect(found).toEqual({ placed: [], unplaced: ['zero'] });
	});

	it('knows the user\'s file however Clang spelled the path to it', () => {
		const files: Files = { ...FILES, 'source/util.h': new TextEncoder().encode('int f();\n') };
		const warning = error({ severity: 'warning', file: 'source/./util.h', line: 1, column: 5, text: 'util.h warning\n' });

		expect(placed([step(warning)], files)).toMatchObject([{ file: 'source/util.h', line: 0, start: 4 }]);
		expect(shownOutput(step(warning), files)).toBe('util.h warning\n');
	});

	it('keeps warnings in the user\'s files with their option, and leaves the headers\' out', () => {
		const own = error({ severity: 'warning', file: 'source/main.cpp', line: 4, column: 20, flag: '-Wunused-variable' });
		const codal = error({ severity: 'warning', file: 'codal/inc/Pin.h', line: 9, column: 1 });

		expect(placed([step(own, codal)]).map(({ severity, code }) => [severity, code])).toEqual([['warning', '-Wunused-variable']]);
	});
});

describe('shownOutput', () => {
	it('drops the warnings in files the user does not have, keeping everything else as printed', () => {
		const shown = shownOutput(
			step(
				error({ severity: 'warning', file: 'codal/inc/Pin.h', line: 9, column: 1, text: 'Pin.h warning\n' }),
				error({ severity: 'warning', text: 'clang++: warning: unused argument\n' }),
				error({ file: 'source/main.cpp', line: 4, column: 44, text: 'main.cpp error\n' }),
				{ severity: null, text: '2 warnings and 1 error generated.\n' }
			),
			FILES
		);

		expect(shown).toBe('clang++: warning: unused argument\nmain.cpp error\n2 warnings and 1 error generated.\n');
	});
});

describe('firstError', () => {
	it('quotes the first error placed in the user\'s files, else the first with no place at all', () => {
		const flash = error({ message: 'section \'.text\' will not fit in region \'FLASH\'' });
		const undeclared = error({ file: 'source/main.cpp', line: 4, column: 44, message: 'use of undeclared identifier\nmore' });

		expect(firstError(problemsOf([step(flash, undeclared)], FILES))).toBe('source/main.cpp:4: use of undeclared identifier');
		expect(firstError(problemsOf([step(flash)], FILES))).toBe('section \'.text\' will not fit in region \'FLASH\'');
		expect(firstError(problemsOf([step({ severity: null, text: '1 warning generated.\n' })], FILES))).toBeNull();
	});
});
