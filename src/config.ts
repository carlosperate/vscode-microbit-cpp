/**
 * Command ids are duplicated in package.json because VS Code reads the manifest;
 * `test/manifest.test.ts` catches the drift. The extension prefix keeps them
 * clear of the micro:bit Foundation's own `microbit.*` commands.
 */
export const COMMANDS = {
	build: 'bbcmicrobit-cpp.build',
	flash: 'bbcmicrobit-cpp.flash',
	createProject: 'bbcmicrobit-cpp.createProject',
} as const;

export type CommandId = (typeof COMMANDS)[keyof typeof COMMANDS];

/** This extension's own id, which is what it registers its mode under. */
export const EXTENSION_ID = 'carlosperate.bbcmicrobit-cpp';

/** The settings section and its keys, as the manifest declares them. */
export const SECTION = 'bbcmicrobit-cpp';
export const SETTINGS = {
	buildExclude: 'build.exclude',
} as const;

/**
 * The user-facing name: the manifest display name, every command category and
 * the output channel.
 */
export const PRODUCT = 'BBC micro:bit C++';

/** Written beside the sources; the hex name is the one the micro:bit's own tools expect. */
export const OUTPUTS = { hex: 'MICROBIT.hex', map: 'MICROBIT.map' } as const;

/**
 * The extension that owns the board, the shared `BBC micro:bit` panel and the
 * mode switcher. This one builds a hex and hands it over; every byte that
 * reaches a board goes through there.
 */
export const MANAGER_EXTENSION = 'carlosperate.bbcmicrobit-manager';

/** The lowest manager API this extension works against, as the types package versions it. */
export const MANAGER_API_VERSION = '0.2.0';

/** The mode this extension registers, and the segment label a user reads. */
export const MODE_ID = 'cpp';
export const MODE_LABEL = 'C++';

/** The clause the manager makes true while this is the active mode; the one view here is gated on it. */
export const MODE_WHEN = `bbcmicrobit-manager.activeMode == ${MODE_ID}`;

/** The shared activity bar container the manager declares. Never declared here. */
export const CONTAINER_ID = 'bbcmicrobit';

/** This extension's half of that panel: welcome content over a tree that stays empty. */
export const VIEW_ID = 'bbcmicrobit-cpp.panel';

/** CODAL here is codal-microbit-v2, so what this builds cannot run on a V1. */
export const BOARD_VERSION = 'V2';
