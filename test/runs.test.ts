import { describe, expect, it, vi } from 'vitest';

import { BuildRuns } from '../src/build/runs';

/** Ownership is asserted through `publish`, which is the only thing it decides. */
const wrote = async (run: { publish: (work: () => Promise<void>) => Promise<boolean> }) =>
	run.publish(async () => {});

describe('BuildRuns', () => {
	it('cancels the running build of the same folder and lets only the newer one publish', async () => {
		const runs = new BuildRuns();
		const first = runs.start('folder-a');
		const second = runs.start('folder-a');

		expect(first.signal.aborted).toBe(true);
		expect(second.signal.aborted).toBe(false);
		expect(await wrote(first)).toBe(false);
		expect(await wrote(second)).toBe(true);
	});

	it('leaves another folder\'s build alone', async () => {
		const runs = new BuildRuns();
		const a = runs.start('folder-a');
		runs.start('folder-b');

		expect(a.signal.aborted).toBe(false);
		expect(await wrote(a)).toBe(true);
	});

	it('cancel aborts the signal and finishing an old run does not disturb the newer one', async () => {
		const runs = new BuildRuns();
		const first = runs.start('folder-a');
		first.cancel();
		expect(first.signal.aborted).toBe(true);

		const second = runs.start('folder-a');
		first.finish();
		expect(await wrote(second)).toBe(true);
	});

	/** The window this closes: an older build checks that it owns the outputs, then a newer one
	 *  finishes and writes while the older one's deletion is still in flight. */
	it('does not let an older build publish once a newer one exists, even mid-flight', async () => {
		const runs = new BuildRuns();
		const older = runs.start('folder-a');
		const order: string[] = [];

		let releaseOlder = () => {};
		const olderPublished = older.publish(async () => {
			order.push('older started');
			await new Promise<void>((resolve) => {
				releaseOlder = resolve;
			});
			order.push('older finished');
		});
		// Let the older write actually begin; until it does, it is simply skipped, as the next test shows.
		await new Promise((resolve) => setTimeout(resolve, 0));

		// The newer build appears while the older one's write is still running.
		const newer = runs.start('folder-a');
		const newerPublished = newer.publish(async () => {
			order.push('newer wrote');
		});
		releaseOlder();

		expect(await olderPublished).toBe(true); // it already owned the outputs when it started
		expect(await newerPublished).toBe(true);
		// Written, but no longer the newest, so its hex must not be handed to anyone.
		expect(older.owns()).toBe(false);
		expect(newer.owns()).toBe(true);
		// Serialised, so the newer write lands after the older one finishes rather than under it.
		expect(order).toEqual(['older started', 'older finished', 'newer wrote']);
	});

	it('skips an older build that had not started publishing when a newer one arrived', async () => {
		const runs = new BuildRuns();
		const older = runs.start('folder-a');
		runs.start('folder-a');

		const wrote = vi.fn(async () => {});
		expect(await older.publish(wrote)).toBe(false);
		expect(wrote).not.toHaveBeenCalled();
	});

	it('keeps the queue moving after a publish throws', async () => {
		const runs = new BuildRuns();
		const failing = runs.start('folder-a');
		const failed = failing.publish(async () => {
			throw new Error('the disk said no');
		});
		await expect(failed).rejects.toThrow('the disk said no');

		const next = runs.start('folder-a');
		expect(await next.publish(async () => {})).toBe(true);
	});
});
