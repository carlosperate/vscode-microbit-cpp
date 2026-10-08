/**
 * What the list shows for Clang's records, read by the toolchain's own reader from lines Clang
 * printed for CODAL, so a change in either the records or this mapping fails here.
 */
import { describe, expect, it } from 'vitest';

import { readCompletions } from 'microbit-clang-wasm';

import { byteColumn, isIncomplete, isMemberAccess, isNamedOnly, itemsOf } from '../src/build/items';
import type { CompletionReport } from '../src/build/protocol';

const records = (...lines: string[]) => readCompletions(lines.map((line) => `${line}\n`).join('')) as CompletionReport[];

const MEMBERS = records(
	'COMPLETION: Base (InBase) : Base::',
	'COMPLETION: display : [#MicroBitDisplay#]display',
	'COMPLETION: operator= : [#MicroBit &#]operator=(<#const MicroBit &#>)',
	'COMPLETION: scroll (InBase) : [#int#][#AnimatedDisplay::#]scroll(<#ManagedString s#>{#, <#int delay = DISPLAY_DEFAULT_SCROLL_SPEED#>#}) : Scrolls the given string across the display, from right to left.',
	'COMPLETION: secret (Inaccessible) : [#int#]secret',
	'COMPLETION: size : [#int#]size()[# const#]',
	'COMPLETION: speak (Hidden,InBase) : [#void#]Base::speak()',
	'COMPLETION: ~MicroBit : [#void#]~MicroBit()'
);

const IN_SCOPE = records(
	'COMPLETION: __func__',
	'COMPLETION: char16_t',
	'COMPLETION: codal : codal:: : Class definition for a MicroBit device.',
	'COMPLETION: DEVICE_OK : [#ErrorCode#]DEVICE_OK',
	'COMPLETION: ManagedString : ManagedString : Class definition for a ManagedString.',
	'COMPLETION: MICROBIT_ID_BUTTON_A : MICROBIT_ID_BUTTON_A',
	'COMPLETION: Pattern : [#size_t#]sizeof(<#expression-or-type#>)',
	'OPENING_PAREN_LOC: main.cpp:7:24',
	'OVERLOAD: [#int#]scroll(ManagedString s)',
	'PREFERRED-TYPE: int'
);

const member = { member: true, typed: '', byName: false };
const inScope = { member: false, typed: '', byName: false };

describe('itemsOf', () => {
	it('after a member access, leaves out what cannot be typed there', () => {
		expect(itemsOf(MEMBERS, member).map((item) => item.name)).toEqual(['display', 'scroll', 'size']);
	});

	it('shows a method with every parameter, defaults included, and inserts only the required ones', () => {
		const scroll = itemsOf(MEMBERS, member).find((item) => item.name === 'scroll');
		expect(scroll).toEqual({
			kind: 'method',
			name: 'scroll',
			signature: '(ManagedString s, int delay = DISPLAY_DEFAULT_SCROLL_SPEED)',
			type: 'int',
			detail: 'int scroll(ManagedString s, int delay = DISPLAY_DEFAULT_SCROLL_SPEED)',
			documentation: 'Scrolls the given string across the display, from right to left.',
			insert: 'scroll(${1:ManagedString s})',
			snippet: true,
		});
	});

	it('inserts the brackets of a call with no arguments, and shows a const method as const', () => {
		const size = itemsOf(MEMBERS, member).find((item) => item.name === 'size');
		expect(size).toMatchObject({ kind: 'method', signature: '() const', insert: 'size()', snippet: true });
	});

	it('inserts a field by its name, its type at the side', () => {
		const display = itemsOf(MEMBERS, member).find((item) => item.name === 'display');
		expect(display).toMatchObject({ kind: 'field', type: 'MicroBitDisplay', signature: '', insert: 'display', snippet: false });
	});

	it('tells the kinds in scope apart, and drops overloads and the other records', () => {
		const kinds = Object.fromEntries(itemsOf(IN_SCOPE, inScope).map((item) => [item.name, item.kind]));
		expect(kinds).toEqual({
			char16_t: 'keyword',
			codal: 'namespace',
			DEVICE_OK: 'variable',
			ManagedString: 'class',
			MICROBIT_ID_BUTTON_A: 'constant',
			sizeof: 'snippet',
		});
	});

	it('inserts a pattern with its placeholders and a namespace with its qualifier', () => {
		const items = itemsOf(IN_SCOPE, inScope);
		expect(items.find((item) => item.name === 'sizeof')).toMatchObject({ insert: 'sizeof(${1:expression-or-type})', snippet: true });
		expect(items.find((item) => item.name === 'codal')).toMatchObject({ insert: 'codal::', documentation: 'Class definition for a MicroBit device.' });
	});

	it('shows reserved names only once the user has typed an underscore', () => {
		expect(itemsOf(IN_SCOPE, inScope).some((item) => item.name === '__func__')).toBe(false);
		expect(itemsOf(IN_SCOPE, { ...inScope, typed: '_' }).some((item) => item.name === '__func__')).toBe(true);
	});

	it('asks VS Code to ask again only while an underscore could still bring reserved names back', () => {
		expect(isIncomplete(IN_SCOPE, inScope)).toBe(true);
		expect(isIncomplete(IN_SCOPE, { ...inScope, typed: 'c' })).toBe(false);
		expect(isIncomplete(MEMBERS, member)).toBe(false);
	});

	it('inserts only a function\'s name where it is named rather than called', () => {
		const scroll = itemsOf(MEMBERS, { ...member, byName: true }).find((item) => item.name === 'scroll');
		expect(scroll).toMatchObject({ insert: 'scroll', snippet: false });
	});

	it('takes a function with template arguments for a function', () => {
		const [item] = itemsOf(records('COMPLETION: make_shared : [#shared_ptr<_Tp>#]make_shared<<#class _Tp#>>(<#_Args &&__args...#>)'), inScope);
		expect(item).toMatchObject({ kind: 'function', insert: 'make_shared<${1:class _Tp}>(${2:_Args &&__args...})', snippet: true });
	});

	it('inserts an included file by its name, leaving its closing quote alone', () => {
		const [item] = itemsOf(records('COMPLETION: Pattern : MicroBit.h"'), inScope);
		expect(item).toMatchObject({ kind: 'snippet', name: 'MicroBit.h', insert: 'MicroBit.h', snippet: false });
	});

	it('escapes what a snippet would read as its own syntax', () => {
		const [item] = itemsOf(records('COMPLETION: price : [#int#]price(<#const char *$symbol#>)'), inScope);
		expect(item.insert).toBe('price(${1:const char *\\$symbol})');
	});
});

describe('byteColumn', () => {
	it('counts the bytes Clang counts, from 1', () => {
		// é is one UTF-16 unit and two bytes, 🙂 two units and four bytes.
		const line = 'é🙂.x';
		expect(byteColumn(line, 0)).toBe(1);
		expect(byteColumn(line, 3)).toBe(7);
		expect(byteColumn(line, 4)).toBe(8);
	});
});

describe('isNamedOnly', () => {
	it('is brackets after the word, or an address taken before it, but not a logical and', () => {
		expect([
			isNamedOnly('    uBit.display.', '("hello");'),
			isNamedOnly('listen(1, 2, &', ');'),
			isNamedOnly('    uBit.display.', ''),
			isNamedOnly('if (ready && ', ')'),
		]).toEqual([true, true, false, false]);
	});
});

describe('isMemberAccess', () => {
	it('is the text before the word ending in . or ->', () => {
		expect([isMemberAccess('    uBit.'), isMemberAccess('p->'), isMemberAccess('codal::'), isMemberAccess('x = ')]).toEqual([true, true, false, false]);
	});
});
