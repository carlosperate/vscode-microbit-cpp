import { describe, expect, it } from 'vitest';

import manifest from '../package.json';
import { COMMANDS, CONTAINER_ID, MANAGER_EXTENSION, MODE_WHEN, VIEW_ID } from '../src/config';

/**
 * This extension's half of the shared panel is strings in the manifest that VS
 * Code interprets: a container id another extension declares, a context key
 * another extension sets, and command ids in markdown. A typo in any of them
 * shows nothing and says nothing, which is why they are checked here.
 */
const views: { id: string; name: string; type?: string; when?: string }[] = manifest.contributes.views[CONTAINER_ID];
const welcome = manifest.contributes.viewsWelcome;

/** Every `[label](command:id)` link in the welcome content, in the order a user reads them. */
const buttons = welcome.flatMap((entry) =>
	[...entry.contents.matchAll(/\[([^\]]+)\]\(command:([^)]+)\)/g)].map((match) => ({
		label: match[1].replace(/\$\([a-z-]+\)\s*/, ''),
		command: match[2],
	}))
);

describe('the view in the shared panel', () => {
	/**
	 * The manager owns the container, and a mode contributes into it. Declaring a
	 * container of our own again would be a second micro:bit icon.
	 */
	it('goes into the container the manager declares, and declares none of its own', () => {
		expect(views).toHaveLength(1);
		expect(views[0]?.id).toBe(VIEW_ID);
		expect('viewsContainers' in manifest.contributes).toBe(false);
	});

	/**
	 * The workbench splits a section's height equally between the views an
	 * extension puts there, and honours `initialSize` only for the container's
	 * owner, so a second view would take half the panel whatever it held.
	 */
	it('is one tree, whose welcome content is the buttons', () => {
		expect(views[0]?.type).toBeUndefined();
		expect(welcome.every((entry) => entry.view === VIEW_ID)).toBe(true);
	});

	/**
	 * The manager names the active mode in one key, and this clause is true only
	 * while it names C++, which is how switching hides everything of ours. A view
	 * without the clause would stay visible inside every other mode.
	 */
	it('is gated on the active-mode clause the manager makes true', () => {
		expect(views[0]?.when).toBe(MODE_WHEN);
	});

	/**
	 * Pane headers are rendered with `text-transform: capitalize`, which turns
	 * `micro:bit` into `Micro:Bit`, so a view name has to read right capitalised.
	 */
	it('is named so that capitalising it changes nothing', () => {
		const capitalised = (views[0]?.name ?? '').replace(
			/(^|[^a-z])([a-z])/gi,
			(_, before: string, letter: string) => `${before}${letter.toUpperCase()}`
		);
		expect(capitalised).toBe(views[0]?.name);
	});
});

describe('the buttons', () => {
	/** One link per line is what makes each button its own row across the panel. */
	it('are one per row, in the order Build, Flash, serial terminal', () => {
		expect(welcome).toHaveLength(1);
		expect(welcome[0]?.contents.split('\n')).toHaveLength(buttons.length);
		expect(buttons.map((button) => button.command)).toEqual([
			COMMANDS.build,
			COMMANDS.flash,
			'bbcmicrobit-manager.openTerminal',
		]);
	});

	/**
	 * Welcome content is markdown, so a button is a link to a command id and the
	 * manager's is spelled out here. `test/integration` compares it with the id
	 * the API publishes, which is the half a manifest cannot check.
	 */
	it("run this extension's own commands, and the manager's for the board", () => {
		const ours = new Set(manifest.contributes.commands.map((command) => command.command));
		for (const { command } of buttons) {
			expect(ours.has(command) || command.startsWith('bbcmicrobit-manager.'), command).toBe(true);
		}
	});

	it('say what they do without needing the panel for context', () => {
		expect(buttons.map((button) => button.label)).toEqual([
			'Build micro:bit C++ project',
			'Flash C++ project hex',
			'Open serial terminal',
		]);
	});
});

describe('the dependency on the manager', () => {
	/** Installing this installs the manager, and the container it declares is what our view needs. */
	it('is declared, so the container always exists', () => {
		expect(manifest.extensionDependencies).toContain(MANAGER_EXTENSION);
	});

	/**
	 * A mode that activated on the workspace it recognises would never register in
	 * a workspace of another kind, and could then never be switched to.
	 */
	it('activates at startup, so the mode is registered whatever the workspace holds', () => {
		expect(manifest.activationEvents).toContain('onStartupFinished');
	});
});
