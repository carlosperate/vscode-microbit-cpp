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

// What makes a folder look like a micro:bit C++ project, for the mode's claim on a workspace. Not
// `SOURCE_GLOB`: a folder whose only C++ file is a header belongs to somebody else's project.
export const CLAIM_GLOB = '**/{codal.json,*.cpp,*.cc,*.cxx}';

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

// `findFiles` answers `/d:/…` where a workspace folder says `/D:/…`.
const comparable = (path: string) => path.replace(/^\/[a-zA-Z]:/, (drive) => drive.toLowerCase());

/** Not `asRelativePath`, which answers against the innermost root and in Windows separators. */
export function relativeTo(folderPath: string, filePath: string): string | null {
	const base = folderPath.endsWith('/') ? folderPath : `${folderPath}/`;
	return comparable(filePath).startsWith(comparable(base)) ? filePath.slice(base.length) : null;
}

export interface Located {
	scheme: string;
	authority: string;
	path: string;
}

/** An untitled buffer, or a file on another remote, is not this folder's however its path reads. */
export const isInside = (folder: Located, uri: Located): boolean =>
	uri.scheme === folder.scheme && uri.authority === folder.authority && relativeTo(folder.path, uri.path) !== null;
