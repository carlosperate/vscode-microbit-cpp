import { describe, expect, it } from 'vitest';

import manifest from '../package.json';
import { COMMANDS, CONTAINER_ID, MANAGER_EXTENSION, PRODUCT, VIEW_ID } from '../src/config';

/**
 * The sidebar is strings in the manifest that VS Code interprets: a container
 * id, a view in it, their names, and command ids in markdown. A typo in any of
 * them shows nothing and says nothing, which is why they are checked here.
 */
const container = manifest.contributes.viewsContainers.activitybar.find((entry) => entry.id === CONTAINER_ID);
const views: { id: string; name: string; type?: string; when?: string }[] = manifest.contributes.views[CONTAINER_ID];
const welcome = manifest.contributes.viewsWelcome;

/** Every `[label](command:id)` link in the welcome content, in the order a user reads them. */
const buttons = welcome.flatMap((entry) =>
	[...entry.contents.matchAll(/\[([^\]]+)\]\(command:([^)]+)\)/g)].map((match) => ({
		label: match[1].replace(/\$\([a-z-]+\)\s*/, ''),
		command: match[2],
	}))
);

describe('the sidebar', () => {
	it('is a container of its own, titled with the product name', () => {
		expect(container?.title).toBe(PRODUCT);
		expect(Object.keys(manifest.contributes.views)).toEqual([CONTAINER_ID]);
	});

	/** A second view would cost its own header and a body never under 120px, so the buttons share one. */
	it('is one tree, whose welcome content is the buttons', () => {
		expect(views).toHaveLength(1);
		expect(views[0]?.id).toBe(VIEW_ID);
		expect(views[0]?.type).toBeUndefined();
		expect(welcome.every((entry) => entry.view === VIEW_ID)).toBe(true);
	});

	/** VS Code merges a lone view's name into the container header, and shows it once only when the two match. */
	it('names the view the same as its container', () => {
		expect(views[0]?.name).toBe(container?.title);
	});

	/** A `when` hides the icon until a key is set, so it would arrive a moment after the window. */
	it('shows the view unconditionally', () => {
		expect(views[0]?.when).toBeUndefined();
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
	/** Installing this installs the manager, which owns the board. */
	it('is declared', () => {
		expect(manifest.extensionDependencies).toContain(MANAGER_EXTENSION);
	});

	/** Activating only on a C++ workspace would leave the status bar menu without our commands everywhere else. */
	it('activates at startup, so the menu group is registered whatever the workspace holds', () => {
		expect(manifest.activationEvents).toContain('onStartupFinished');
	});
});
