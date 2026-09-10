/**
 * Which files a build takes. Pure: `build.ts` turns the workspace into the globs
 * and paths decided here.
 */

// Headers and anything a `#include` can name, plus the sources that cannot be built yet: collected
// so Build can name them, rather than leaving them out and failing the link with an undefined
// symbol that explains nothing.
export const SOURCE_GLOB = '**/*.{cpp,cc,cxx,c,s,S,asm,h,hpp,hh,hxx,inc}';

/** What the recipe compiles; the rest only has to be present. */
export const SOURCE = /\.(cpp|cc|cxx)$/i;

// C and assembly. Mirrors the compiler package, which refuses these itself and stays the authority;
// checking here as well is what makes the refusal immediate and specific about which files.
export const UNSUPPORTED = /\.(c|s|asm)$/i;

/** Past this a folder is more likely the wrong one than a large program. */
export const MAX_FILES = 1000;

/**
 * One brace group, because `findFiles` takes a single glob: the extension's
 * setting plus the folder's `files.exclude`, which `findFiles` stops applying
 * the moment any exclude is passed. A pattern carrying a brace or a comma of
 * its own would break the group open and silently void every other exclude, so
 * those are reported back instead of joined.
 */
export function excludeGlob(
	configured: unknown,
	filesExclude: unknown
): { glob: string | null; unsupported: string[] } {
	const wanted = Array.isArray(configured) ? configured.filter(isPattern) : [];
	if (filesExclude && typeof filesExclude === 'object') {
		for (const [pattern, on] of Object.entries(filesExclude)) if (on === true && isPattern(pattern)) wanted.push(pattern);
	}

	const glob = wanted.filter((pattern) => !/[{},]/.test(pattern));
	return {
		glob: glob.length ? `{${glob.join(',')}}` : null,
		unsupported: wanted.filter((pattern) => /[{},]/.test(pattern)),
	};
}

const isPattern = (entry: unknown): entry is string => typeof entry === 'string' && entry.length > 0;

/**
 * A file's path relative to the folder being built. `asRelativePath` answers
 * against the innermost workspace folder that holds the file, which is a
 * different one when roots are nested inside each other.
 */
export function relativeTo(folderPath: string, filePath: string): string | null {
	const base = folderPath.endsWith('/') ? folderPath : `${folderPath}/`;
	return filePath.startsWith(base) ? filePath.slice(base.length) : null;
}

/** Whether a document belongs to the folder. Whole URIs, so scheme and authority count too. */
export const isInside = (folderUri: string, uri: string): boolean => relativeTo(folderUri, uri) !== null;
