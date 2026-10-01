/**
 * What the compiler's records become for the user. The toolchain reads its own
 * output; only this side knows which files are the user's, so what is shown,
 * where, and in VS Code's units is decided here. Pure, for the tests.
 */
import type { Diagnostic, OtherOutput } from 'microbit-clang-wasm-codal';

import type { Files, StepReport } from './protocol';

/** A range on one line, 0-based, columns in UTF-16 units. `start === end` is a point VS Code widens to the word there. */
export interface Place {
	file: string;
	line: number;
	start: number;
	end: number;
}

export interface Problem extends Place {
	severity: Diagnostic['severity'];
	message: string;
	code: string | null;
	related: (Place & { message: string })[];
}

/** The problems with a place in the user's files, and the messages of the errors with none. */
export interface Found {
	placed: Problem[];
	unplaced: string[];
}

/** Anything with a file and a line: a diagnostic, a note, an `#include` line, whose column is the whole line. */
type At = { file: string | null; line: number | null; column?: number | null };

/**
 * The name the user gave a file Clang printed, or null when it is not theirs. Clang prints the path
 * it opened, not the shortest, so `source/./util.h` is the user's `source/util.h`.
 */
function usersName(files: Files, path: string): string | null {
	const parts: string[] = [];
	for (const part of path.split('/')) {
		if (part === '..' && parts.length > 0 && parts[parts.length - 1] !== '..') parts.pop();
		else if (part !== '.' && part !== '') parts.push(part);
	}
	const name = `${path.startsWith('/') ? '/' : ''}${parts.join('/')}`;
	return Object.prototype.hasOwnProperty.call(files, name) ? name : null;
}

/** A warning in a header the user does not own: CODAL's own raise about 45 per file, every build. */
function isHidden(entry: Diagnostic | OtherOutput, files: Files): boolean {
	return entry.severity !== null && entry.severity !== 'error' && entry.file !== null && usersName(files, entry.file) === null;
}

/** One step's output for the log, as the compiler printed it, less the headers' warnings. */
export function shownOutput(step: StepReport, files: Files): { text: string; hidden: number } {
	const shown = step.diagnostics.filter((entry) => !isHidden(entry, files));
	return { text: shown.map((entry) => entry.text).join(''), hidden: step.diagnostics.length - shown.length };
}

export function problemsOf(steps: readonly StepReport[], files: Files): Found {
	const placeOf = placer(files);
	const found: Found = { placed: [], unplaced: [] };
	const seen = new Set<string>();

	for (const entry of steps.flatMap((step) => step.diagnostics)) {
		if (entry.severity === null) continue;
		const own = placeOf(entry);
		// An error elsewhere goes where the user can act: a note in their own files, such as the
		// `#define` a macro came from or the call a template was made for, else their `#include`.
		const candidates: At[] = own || entry.severity !== 'error' ? [] : [...entry.notes, ...entry.includedFrom];
		const via = candidates.find((at) => placeOf(at) !== null);
		const at = own ?? (via ? placeOf(via) : null);
		if (!at) {
			if (entry.severity === 'error') found.unplaced.push(entry.message.split('\n')[0]);
			continue;
		}

		// clangd's rule for a header's errors, one per position they move to, since a broken header cascades.
		const moved = !own && entry.file !== null;
		const key = `${at.file}:${at.line}:${at.start}${moved ? '' : `:${entry.severity}:${entry.message}`}`;
		if (seen.has(key)) continue;
		seen.add(key);

		const related: Problem['related'] = [];
		let elsewhere = '';
		for (const note of entry.notes.filter((note) => note !== via)) {
			const place = placeOf(note);
			if (place) related.push({ ...place, message: note.message });
			else elsewhere += `\n${note.file ? `${named(note)}: ` : ''}${note.message}`;
		}
		const origin = moved ? ` (${named(entry)})` : '';
		found.placed.push({ ...at, severity: entry.severity, message: `${entry.message}${origin}${elsewhere}`, code: entry.flag, related });
	}
	return found;
}

/** What a failed build's notification quotes: the first error the user can find, else the first with no place. */
export function firstError({ placed, unplaced }: Found): string | null {
	const error = placed.find((problem) => problem.severity === 'error');
	return error ? `${error.file}:${error.line + 1}: ${error.message.split('\n')[0]}` : (unplaced[0] ?? null);
}

/** `Button.h:41`, short, since the full path names a file nobody can open. */
const named = ({ file, line }: At) => `${file?.split('/').pop() ?? ''}${line === null ? '' : `:${line}`}`;

/**
 * Clang counts a column in the bytes it read and VS Code in UTF-16 units of the decoded text, so a
 * column is measured on the file's own bytes, decoded from its start as VS Code decodes them: that
 * drops a byte-order mark only at the very start, and turns each invalid byte into one character.
 */
function placer(files: Files): (at: At) => Place | null {
	const decoded = new Map<string, { lines: string[]; starts: number[] }>();
	const decoder = new TextDecoder();
	return (at) => {
		// Line 0 is real Clang output, after a `#line 0`, and no place VS Code can mark.
		const file = at.file === null || at.line === null || at.line < 1 ? null : usersName(files, at.file);
		if (file === null || at.line === null) return null;
		const bytes = files[file];
		if (!decoded.has(file)) decoded.set(file, { lines: decoder.decode(bytes).split(/\r?\n/), starts: lineStarts(bytes) });
		const { lines, starts } = decoded.get(file) ?? { lines: [], starts: [] };
		const line = at.line - 1;
		const text = lines[line] ?? '';
		if (at.column == null) return { file, line, start: Math.max(0, text.search(/\S/)), end: text.length };
		const from = starts[line] ?? bytes.length;
		const upTo = (end: number) => decoder.decode(bytes.subarray(0, end)).length;
		const character = upTo(Math.min(bytes.length, from + at.column - 1)) - upTo(from);
		return { file, line, start: character, end: character };
	};
}

function lineStarts(bytes: Uint8Array): number[] {
	const starts = [0];
	for (let i = 0; i < bytes.length; i++) if (bytes[i] === 0x0a) starts.push(i + 1);
	return starts;
}
