/**
 * What Clang's completion records become in the list. The toolchain reads Clang's text; which
 * candidates a user sees, how each is labelled and what picking one types is decided here. Pure,
 * for the tests, and in VS Code's terms only through the kinds named below.
 */
import type { CompletionChunk } from 'microbit-clang-wasm-codal';

import type { CompletionReport } from './protocol';

export type ItemKind = 'method' | 'function' | 'field' | 'variable' | 'class' | 'namespace' | 'constant' | 'keyword' | 'snippet';

export interface Item {
	kind: ItemKind;
	/** What is typed, and what the list filters on. */
	name: string;
	/** After the name in the list: the parameters, defaults included, or a trailing ` const`. */
	signature: string;
	/** The type, at the list's right. */
	type: string | null;
	/** The whole declaration, for the details beside the list. */
	detail: string;
	documentation: string | null;
	/** What picking it types, a snippet when `snippet` is set: a call's required arguments as placeholders. */
	insert: string;
	snippet: boolean;
}

// What picking these types is their completion string, brackets and arguments; anything else, its name.
const SPELLED_OUT = new Set<ItemKind>(['method', 'function', 'namespace', 'snippet']);

export interface Context {
	/** After `.` or `->`, where a member's constructors, destructor and qualifiers mean nothing. */
	member: boolean;
	/** The part of the word already typed. */
	typed: string;
	/** A function is named, not called: brackets already follow, or `&` takes its address. */
	byName: boolean;
}

export const isMemberAccess = (beforeWord: string): boolean => /(\.|->)\s*$/.test(beforeWord);

export const isNamedOnly = (beforeWord: string, afterWord: string): boolean => /^\s*\(/.test(afterWord) || /(^|[^&])&\s*$/.test(beforeWord);

export function itemsOf(records: readonly CompletionReport[], context: Context): Item[] {
	const items: Item[] = [];
	for (const record of records) {
		if (!('name' in record) || hiddenName(record.name, context)) continue;
		if (record.kind === 'keyword') items.push(keyword(record.name));
		else if (record.kind === 'pattern') items.push(described(record.name, record.chunks, null, 'snippet'));
		else if (record.kind === 'candidate' && shown(record, context)) {
			const kind = kindOf(record, context);
			items.push(described(record.name, record.chunks, record.brief, kind, context.byName && (kind === 'method' || kind === 'function')));
		}
	}
	return items;
}

/** With nothing typed, a list that left out `_` names is asked for again once one is typed. */
export const isIncomplete = (records: readonly CompletionReport[], { typed }: Context): boolean =>
	typed === '' && records.some((record) => 'name' in record && record.name.startsWith('_'));

const ENCODER = new TextEncoder();

/** Clang's column counts bytes of UTF-8 from 1, VS Code's characters in UTF-16 from 0. */
export const byteColumn = (lineText: string, character: number): number => ENCODER.encode(lineText.slice(0, character)).length + 1;

type Candidate = Extract<CompletionReport, { kind: 'candidate' }>;

function shown(record: Candidate, { member }: Context): boolean {
	if (record.tags.includes('Inaccessible') || record.tags.includes('Hidden')) return false;
	if (!member) return true;
	// `uBit.` offers `~MicroBit`, `operator=` and `CodalComponent::`, none of them a thing to type there.
	return !record.name.startsWith('~') && !/^operator\W/.test(record.name) && !rendered(record.chunks).endsWith('::');
}

// Reserved names, CMSIS's `__CLREX` and Clang's `_Nonnull` among them, unless the user asked.
const hiddenName = (name: string, { typed }: Context) => name.startsWith('_') && !typed.startsWith('_');

function kindOf(record: Candidate, { member }: Context): ItemKind {
	const text = rendered(record.chunks);
	const call = text.startsWith(`${record.name}(`) || (text.startsWith(`${record.name}<`) && text.includes('('));
	if (call) return member ? 'method' : 'function';
	if (text.endsWith('::')) return 'namespace';
	if (resultType(record.chunks) !== null) return member ? 'field' : 'variable';
	// No type and no parameters: a macro, which is in capitals by convention, or a type's name.
	return /^[A-Z0-9_]+$/.test(record.name) ? 'constant' : 'class';
}

const keyword = (name: string): Item => ({ kind: 'keyword', name, signature: '', type: null, detail: name, documentation: null, insert: name, snippet: false });

/** `byName` is a function named rather than called, which types its name alone. */
function described(name: string, chunks: CompletionChunk[], documentation: string | null, kind: ItemKind, byName = false): Item {
	const type = resultType(chunks);
	const text = rendered(chunks);
	// A pattern with nothing to fill in, as `true` or an included file, types its name: not the quote after it.
	const snippet = !byName && SPELLED_OUT.has(kind) && (kind !== 'snippet' || chunks.some((chunk) => chunk.kind === 'placeholder'));
	return {
		kind,
		name,
		signature: text.startsWith(name) ? text.slice(name.length) : '',
		type,
		detail: type ? `${type} ${text}` : text,
		documentation,
		insert: snippet ? inserted(chunks) : name,
		snippet,
	};
}

/** The result type Clang puts first, as `int` in `[#int#]scroll(`. */
function resultType(chunks: CompletionChunk[]): string | null {
	const [first, second] = chunks;
	return first?.kind === 'informative' && second !== undefined && !first.text.endsWith('::') ? first.text : null;
}

/** The declaration as written, defaults included, without its result type or the class it comes from. */
const rendered = (chunks: CompletionChunk[]): string => written(resultType(chunks) === null ? chunks : chunks.slice(1));

const written = (chunks: CompletionChunk[]): string =>
	chunks.map((chunk) => (chunk.kind === 'optional' ? written(chunk.chunks) : chunk.kind === 'informative' && chunk.text.endsWith('::') ? '' : chunk.text)).join('');

/** The required arguments as placeholders and the defaulted ones left out, as clangd does. */
function inserted(chunks: CompletionChunk[]): string {
	let placeholders = 0;
	return chunks
		.map((chunk) => {
			if (chunk.kind === 'text') return escape(chunk.text);
			if (chunk.kind === 'placeholder') return `\${${++placeholders}:${escape(chunk.text)}}`;
			return ''; // a type, a note, or the optional arguments
		})
		.join('');
}

const escape = (text: string) => text.replace(/[\\$}]/g, (character) => `\\${character}`);
