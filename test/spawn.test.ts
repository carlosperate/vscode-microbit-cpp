/**
 * The web spawn wrapper's own job: notice a worker that never loads. VS Code's extension host hands
 * out a nested worker whose `onerror` is never wired, so silence is the only signal there is.
 */
import { describe, expect, it, vi } from 'vitest';

import { wrapWorker } from '../src/browser/spawn';

/** Enough of a Worker for the wrapper, which only ever sets three handlers. */
interface FakeWorker {
	onmessage: ((event: MessageEvent) => void) | null;
	onmessageerror: ((event: MessageEvent) => void) | null;
	postMessage: () => void;
	terminate: () => void;
}

function fakeWorker() {
	const raw: FakeWorker = { onmessage: null, onmessageerror: null, postMessage: vi.fn(), terminate: vi.fn() };
	return { worker: raw as unknown as Worker, raw };
}

const after = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('wrapWorker', () => {
	it('reports a crash when no message arrives before the deadline', async () => {
		const { worker } = fakeWorker();
		const crashed = vi.fn();
		wrapWorker(worker, 10).onCrash(crashed);

		await after(30);
		expect(crashed).toHaveBeenCalledWith(expect.stringMatching(/never started/));
	});

	it('stays quiet once the worker has answered, however long it then takes', async () => {
		const { worker, raw } = fakeWorker();
		const crashed = vi.fn();
		const wrapped = wrapWorker(worker, 10);
		const seen: unknown[] = [];
		wrapped.onMessage((message) => seen.push(message));
		wrapped.onCrash(crashed);

		raw.onmessage?.({ data: { type: 'ready' } } as MessageEvent);
		await after(30);

		expect(seen).toEqual([{ type: 'ready' }]);
		expect(crashed).not.toHaveBeenCalled();
	});

	it('does not report a crash after it has been terminated', async () => {
		const { worker, raw } = fakeWorker();
		const crashed = vi.fn();
		const wrapped = wrapWorker(worker, 10);
		wrapped.onCrash(crashed);

		wrapped.terminate();
		await after(30);

		expect(raw.terminate).toHaveBeenCalled();
		expect(crashed).not.toHaveBeenCalled();
	});
});
