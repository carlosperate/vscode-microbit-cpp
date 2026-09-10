/**
 * Command ids are duplicated in package.json because VS Code reads the manifest;
 * `test/manifest.test.ts` catches the drift. The extension prefix keeps them
 * clear of the micro:bit Foundation's own `microbit.*` commands.
 */
export const COMMANDS = {
	build: 'bbcmicrobit-cpp.build',
	createProject: 'bbcmicrobit-cpp.createProject',
} as const;

export type CommandId = (typeof COMMANDS)[keyof typeof COMMANDS];

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
