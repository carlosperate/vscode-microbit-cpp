/**
 * The host side of the worker protocol against a scripted worker: asset
 * requests answered, steps forwarded, cancels sent, and a crash that fails every
 * pending build and leaves the next one a fresh worker.
 */
import { describe, expect, it, vi } from 'vitest';

import { BuildError, Compiler, type CompilerOptions, type CompilerWorker } from '../src/build/compiler';
import type { BuildOutcome, FromWorker, ToWorker } from '../src/build/protocol';

const OUTCOME: BuildOutcome = { ok: true, hex: ':00000001FF\n', map: '', lastStep: null };

/** A worker whose replies the test writes; `sent` is what the host posted to it. */
function fakeWorker() {
	const sent: ToWorker[] = [];
	let toHost: (message: FromWorker) => void = () => {};
	let crash: (reason: string) => void = () => {};
	const worker: CompilerWorker = {
		postMessage: (message) => sent.push(message),
		onMessage: (listener) => {
			toHost = listener;
		},
		onCrash: (listener) => {
			crash = listener;
		},
		terminate: vi.fn(),
	};
	return { worker, sent, reply: (message: FromWorker) => toHost(message), crash: (reason: string) => crash(reason) };
}

/** A compiler wired to one scripted worker; pass only what a case varies. */
function harness(options: Partial<CompilerOptions> = {}) {
	const fake = fakeWorker();
	const compiler = new Compiler({ spawn: () => fake.worker, loadAsset: async () => new Uint8Array(), ...options });
	return { ...fake, compiler };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('Compiler', () => {
	it('starts one worker on the first build and reuses it', async () => {
		const fake = fakeWorker();
		const spawn = vi.fn(() => fake.worker);
		const compiler = new Compiler({ spawn, loadAsset: async () => new Uint8Array() });

		const first = compiler.build({});
		const second = compiler.build({});
		fake.reply({ type: 'done', id: 1, outcome: OUTCOME });
		fake.reply({ type: 'done', id: 2, outcome: { ...OUTCOME, hex: 'second' } });

		expect(spawn).toHaveBeenCalledTimes(1);
		expect((await first).hex).toBe(OUTCOME.hex);
		expect((await second).hex).toBe('second');
	});

	it('answers asset requests with the bytes it read', async () => {
		const bytes = new Uint8Array([1, 2, 3]);
		const loadAsset = vi.fn(async () => bytes);
		const { compiler, sent, reply } = harness({ loadAsset });
		void compiler.build({});

		reply({ type: 'asset', id: 7, name: 'toolchain/llvm.core.wasm' });
		await settle();

		expect(loadAsset).toHaveBeenCalledWith('toolchain/llvm.core.wasm');
		expect(sent).toContainEqual({ type: 'asset', id: 7, bytes });
	});

	it('reports a failed asset read to the worker rather than hanging', async () => {
		const { compiler, sent, reply } = harness({ loadAsset: () => Promise.reject(new Error('gone')) });
		void compiler.build({});

		reply({ type: 'asset', id: 1, name: 'codal/payload.tar' });
		await settle();

		expect(sent).toContainEqual({ type: 'asset', id: 1, error: 'Error: gone' });
	});

	it('forwards each step to the build it belongs to', async () => {
		const { compiler, reply } = harness();
		const steps: string[] = [];
		const build = compiler.build({}, { onStep: (step) => steps.push(step.tool) });

		reply({ type: 'step', id: 1, step: { tool: 'clang++', args: [], exitCode: 0, stderr: '' } });
		reply({ type: 'step', id: 99, step: { tool: 'other', args: [], exitCode: 0, stderr: '' } });
		reply({ type: 'done', id: 1, outcome: OUTCOME });

		await build;
		expect(steps).toEqual(['clang++']);
	});

	it('sends a cancel when the signal aborts, and rejects as aborted when the worker says so', async () => {
		const { compiler, sent, reply } = harness();
		const controller = new AbortController();
		const build = compiler.build({}, { signal: controller.signal });

		controller.abort();
		expect(sent).toContainEqual({ type: 'cancel', id: 1 });

		reply({ type: 'failed', id: 1, message: 'This operation was aborted', aborted: true });
		await expect(build).rejects.toMatchObject({ name: 'BuildError', aborted: true });
	});

	it('refuses a build whose signal is already aborted without touching the worker', async () => {
		const spawn = vi.fn(() => fakeWorker().worker);
		const compiler = new Compiler({ spawn, loadAsset: async () => new Uint8Array() });
		const controller = new AbortController();
		controller.abort();

		await expect(compiler.build({}, { signal: controller.signal })).rejects.toBeInstanceOf(BuildError);
		expect(spawn).not.toHaveBeenCalled();
	});

	/** The two routes a death arrives by have to end the same way, or a later build reuses a
	 *  worker that has already thrown. */
	it.each([
		['a crash the host saw itself', (fake: ReturnType<typeof fakeWorker>) => fake.crash('out of memory')],
		[
			'a fault the worker reported',
			(fake: ReturnType<typeof fakeWorker>) => fake.reply({ type: 'crash', reason: 'out of memory' }),
		],
	])('fails every pending build on %s, then starts a fresh worker', async (_name, kill) => {
		const first = fakeWorker();
		const second = fakeWorker();
		const spawn = vi.fn().mockReturnValueOnce(first.worker).mockReturnValueOnce(second.worker);
		const compiler = new Compiler({ spawn, loadAsset: async () => new Uint8Array() });

		const pending = compiler.build({});
		kill(first);

		await expect(pending).rejects.toThrow(/stopped unexpectedly: out of memory/);
		expect(first.worker.terminate).toHaveBeenCalled();

		const next = compiler.build({});
		expect(spawn).toHaveBeenCalledTimes(2);
		second.reply({ type: 'done', id: 2, outcome: OUTCOME });
		expect((await next).ok).toBe(true);
	});

	it('sends a cancel to the worker running now, not the one the build started on', async () => {
		const first = fakeWorker();
		const second = fakeWorker();
		const spawn = vi.fn().mockReturnValueOnce(first.worker).mockReturnValueOnce(second.worker);
		const compiler = new Compiler({ spawn, loadAsset: async () => new Uint8Array() });

		const controller = new AbortController();
		const pending = compiler.build({}, { signal: controller.signal });
		first.crash('out of memory');
		await expect(pending).rejects.toThrow(/stopped unexpectedly/);

		const next = compiler.build({});
		controller.abort(); // the dead worker's build, cancelled late
		expect(first.sent).not.toContainEqual({ type: 'cancel', id: 1 });
		expect(second.sent).toContainEqual({ type: 'cancel', id: 1 });

		second.reply({ type: 'done', id: 2, outcome: OUTCOME });
		expect((await next).ok).toBe(true);
	});

	it('dispose terminates the worker and fails what was pending', async () => {
		const { compiler, worker } = harness();
		const pending = compiler.build({});

		compiler.dispose();

		expect(worker.terminate).toHaveBeenCalled();
		await expect(pending).rejects.toThrow(/shutting down/);
	});
});
