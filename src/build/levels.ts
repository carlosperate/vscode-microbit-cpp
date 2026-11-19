import type { Optimisation } from 'microbit-clang-wasm-codal';

/** Every level the CODAL package takes, in the pick's order, each with the line the pick shows. */
export const DEBUG_LEVELS: Record<Optimisation, string> = {
	'-O0': 'No optimisation: every line and variable as written. Best for stepping through.',
	'-Og': 'Optimised with debugging in mind; this Clang treats it as -O1.',
	'-O1': 'Light optimisation: some variables are optimised out.',
	'-O2': 'As Build: small functions inlined, many variables optimised out.',
	'-O3': 'More optimisation than -O2, for speed.',
	'-Os': 'Optimised for size.',
	'-Oz': 'Optimised for size, harder than -Os.',
};

export const DEFAULT_DEBUG_LEVEL: Optimisation = '-O0';

/** A settings file edited by hand can hold anything, so an unknown value gets the default. */
export function debugLevelOf(value: unknown): Optimisation {
	return (Object.keys(DEBUG_LEVELS) as Optimisation[]).find((level) => level === value) ?? DEFAULT_DEBUG_LEVEL;
}
