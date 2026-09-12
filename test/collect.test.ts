import { describe, expect, it } from 'vitest';

import { SOURCE, SOURCE_GLOB, excludeGlob, isInside, relativeTo } from '../src/build/collect';

describe('excludeGlob', () => {
	it('folds the setting and the enabled files.exclude entries into one brace group', () => {
		expect(excludeGlob(['**/.git/**', '**/build/**'], { '**/node_modules': true, '**/*.tmp': false })).toEqual({
			glob: '{**/.git/**,**/build/**,**/node_modules}',
			unsupported: [],
		});
	});

	it('is null when nothing is excluded, which findFiles reads as no excludes at all', () => {
		expect(excludeGlob([], {}).glob).toBeNull();
		expect(excludeGlob(undefined, undefined).glob).toBeNull();
	});

	it('drops entries that are not globs instead of failing the build', () => {
		expect(excludeGlob(['**/a/**', 7, '', null], 'not an object').glob).toBe('{**/a/**}');
	});

	/** A nested brace would end the group early and void every other exclude, silently. */
	it('reports back a pattern carrying a brace or a comma rather than breaking the group open', () => {
		expect(excludeGlob(['**/keep/**', '**/*.{o,d}'], { 'has,comma': true })).toEqual({
			glob: '{**/keep/**}',
			unsupported: ['**/*.{o,d}', 'has,comma'],
		});
	});
});

describe('relativeTo', () => {
	it('answers against the folder being built, not the innermost one', () => {
		expect(relativeTo('/w/outer', '/w/outer/inner/src/main.cpp')).toBe('inner/src/main.cpp');
		expect(relativeTo('/w/outer/', '/w/outer/main.cpp')).toBe('main.cpp');
	});

	it('is null for a file outside the folder, so the caller can fall back', () => {
		expect(relativeTo('/w/outer', '/w/other/main.cpp')).toBeNull();
		// A sibling whose name merely starts the same is not inside it.
		expect(relativeTo('/w/outer', '/w/outer-two/main.cpp')).toBeNull();
	});

	it('ignores the case of a Windows drive letter, and of nothing else', () => {
		expect(relativeTo('/D:/w/project', '/d:/w/project/src/main.cpp')).toBe('src/main.cpp');
		expect(relativeTo('/d:/w/project', '/D:/w/project/main.cpp')).toBe('main.cpp');
		expect(relativeTo('/D:/w/Project', '/d:/w/project/main.cpp')).toBeNull();
	});

	it('never hands back a Windows separator, which the compiler package rejects', () => {
		expect(relativeTo('/D:/w/project', '/d:/w/project/src/util/helper.cpp')).toBe('src/util/helper.cpp');
	});
});

describe('isInside', () => {
	const at = (scheme: string, authority: string, path: string) => ({ scheme, authority, path });

	/** An untitled buffer or a file on another remote is not this folder's, however its path reads. */
	it('takes the scheme and authority into account, not just the path', () => {
		expect(isInside(at('file', '', '/w/project'), at('file', '', '/w/project/main.cpp'))).toBe(true);
		expect(isInside(at('file', '', '/w/project'), at('untitled', '', '/w/project/main.cpp'))).toBe(false);
		expect(isInside(at('file', 'wsl', '/w/project'), at('file', 'other', '/w/project/main.cpp'))).toBe(false);
		expect(isInside(at('file', '', '/w/project'), at('file', '', '/w/project-two/main.cpp'))).toBe(false);
	});

	it('matches a document whose drive letter is cased differently', () => {
		expect(isInside(at('file', '', '/D:/w/project'), at('file', '', '/d:/w/project/main.cpp'))).toBe(true);
	});
});

describe('what counts as a source', () => {
	it('compiles the C++ extensions and nothing else', () => {
		for (const name of ['main.cpp', 'a/b.cc', 'x.cxx', 'UPPER.CPP']) expect(SOURCE.test(name)).toBe(true);
		for (const name of ['main.c', 'main.h', 'main.hpp', 'notes.md']) expect(SOURCE.test(name)).toBe(false);
	});

	it('collects .c files too, so the compiler can refuse them by name rather than skip them', () => {
		expect(SOURCE_GLOB).toContain(',c,');
	});
});
