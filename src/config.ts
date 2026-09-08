/**
 * Command ids are duplicated in package.json because VS Code reads the manifest;
 * `test/manifest.test.ts` catches the drift. The extension prefix keeps them
 * clear of the micro:bit Foundation's own `microbit.*` commands.
 */
export const COMMANDS = {
	build: 'bbcmicrobit-cpp.build',
} as const;

export type CommandId = (typeof COMMANDS)[keyof typeof COMMANDS];

/** The settings section, as the manifest declares it. */
export const SECTION = 'bbcmicrobit-cpp';

/**
 * The user-facing name: the manifest display name, every command category and
 * the output channel.
 */
export const PRODUCT = 'BBC micro:bit C++';
