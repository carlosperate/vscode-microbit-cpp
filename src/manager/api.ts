/**
 * The shape this extension needs of whatever the manager exported, checked
 * rather than trusted, since the dependency has no version range. Only members
 * every version has had: a manager too old is for `registerMode` to refuse,
 * naming the extension to update, rather than for this to take for missing.
 */
import type { MicrobitManagerApi } from 'vscode-bbcmicrobit-manager-api';

/** The one refusal the manager explains to the user itself. Recognised by name: the types package carries no runtime value. */
export const isIncompatibleApiError = (error: unknown): boolean =>
	typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'IncompatibleApiError';

const NEEDED = ['registerMode', 'connect', 'flashHex'] as const;
const NEEDED_COMMANDS = ['openTerminal'] as const;

export function isManagerApi(candidate: unknown): candidate is MicrobitManagerApi {
	if (typeof candidate !== 'object' || candidate === null) return false;
	const api = candidate as Record<string, unknown>;
	const commands = api.commands as Record<string, unknown> | undefined;
	return (
		typeof api.version === 'string' &&
		NEEDED.every((member) => typeof api[member] === 'function') &&
		typeof commands === 'object' &&
		commands !== null &&
		NEEDED_COMMANDS.every((command) => typeof commands[command] === 'string')
	);
}
