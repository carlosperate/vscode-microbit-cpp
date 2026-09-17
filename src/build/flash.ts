import * as vscode from 'vscode';

import { BOARD_VERSION, PRODUCT } from '../config';
import { log } from '../log';
import type { ManagerLink } from '../manager/link';
import type { Builds } from './build';

/**
 * One flash at a time. Set before the first await: most of what this guards is
 * building and connecting, and the first thing a second Flash meets is often an
 * open device chooser.
 */
let running = false;

export const flash =
	(manager: ManagerLink, builds: Builds) =>
	async (): Promise<void> => {
		if (running) {
			void vscode.window.showInformationMessage(`${PRODUCT}: Flash is already running.`);
			return;
		}

		running = true;
		try {
			await buildAndSend(manager, builds);
		} finally {
			running = false;
		}
	};

/**
 * Build, then hand the hex over. Built before connecting because a compile error
 * should not cost the user a device chooser, and the board that answered goes
 * back as `expect` so one swapped during a slow build is refused rather than
 * flashed with the wrong image.
 */
async function buildAndSend(manager: ManagerLink, builds: Builds): Promise<void> {
	const api = manager.api();
	if (!api) return;

	// Quiet: the hex reaching the board is the outcome, not the file beside the sources.
	const built = await builds.build({ quiet: true });
	if (built.hex === undefined) {
		// The newer build announces itself, which would leave this pressed Flash doing nothing visible.
		if (built.superseded) {
			void vscode.window.showInformationMessage(
				`${PRODUCT}: Flash stopped, because a newer build started before this one finished. Nothing was sent to the micro:bit.`
			);
		}
		return;
	}
	const hex = built.hex;

	// Undefined has been explained by the manager, or was a cancellation needing none.
	const board = await api.connect();
	if (!board) return;

	// The manager hands a plain Intel hex to whatever is connected: nothing in the file says which
	// board it was built for, so the one side that knows has to say so.
	if (board.version !== BOARD_VERSION) {
		log(`Refused to flash: the board is a micro:bit ${board.version} and CODAL builds for a ${BOARD_VERSION}`);
		void vscode.window.showErrorMessage(
			`${PRODUCT}: this program is built with CODAL for the micro:bit ${BOARD_VERSION}, ` +
				`and the board connected is a ${board.version}.`
		);
		return;
	}

	if (!(await api.flashHex(hex, { expect: board }))) return;

	log(`Flashed ${hex.length} characters of hex to a micro:bit ${board.version}`);
	void vscode.window.showInformationMessage(`${PRODUCT}: flashed the project to the micro:bit.`);
}
