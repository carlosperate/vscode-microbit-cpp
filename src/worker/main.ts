/**
 * The compiler side of the protocol, run inside a worker on both hosts. It has
 * no `vscode` and no filesystem: every shipped file arrives from the host by
 * name, and the loaded compiler stays here for the life of the worker.
 */
import { setAssetLoader } from 'microbit-clang-wasm';
import { createCodal, type Optimisation, type Step } from 'microbit-clang-wasm-codal';

import type { CompletionReport, Files, FromWorker, Position, StepReport, ToWorker } from '../build/protocol';

/** The worker global on the web, a `worker_threads` port on the desktop. */
export interface Port {
	post(message: FromWorker, transfer?: ArrayBuffer[]): void;
	onMessage(listener: (message: ToWorker) => void): void;
}

/**
 * Returns the way to report a fault the host cannot see for itself, which on the web is every
 * fault: one `crash`, not one failure per build, because the worker is what is broken.
 */
export function serve(port: Port): (reason: string) => void {
	const assets = new Map<number, { resolve: (bytes: Uint8Array) => void; reject: (error: Error) => void }>();
	let nextAsset = 1;
	const request = (name: string) =>
		new Promise<Uint8Array>((resolve, reject) => {
			const id = nextAsset++;
			assets.set(id, { resolve, reject });
			port.post({ type: 'asset', id, name });
		});

	// The toolchain names its files bare; the CODAL package's names already start with codal/.
	setAssetLoader((name) => request(`toolchain/${name}`));
	const codal = createCodal({ loadAsset: request });
	const running = new Map<number, AbortController>();

	/** A build or a completion, which answers with its own message or with `failed`. */
	async function answer(id: number, work: (signal: AbortSignal) => Promise<{ reply: FromWorker; transfer?: ArrayBuffer[] }>): Promise<void> {
		const controller = new AbortController();
		running.set(id, controller);
		try {
			const { reply, transfer } = await work(controller.signal);
			port.post(reply, transfer);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			port.post({ type: 'failed', id, message, aborted: controller.signal.aborted });
		} finally {
			running.delete(id);
		}
	}

	const build = (id: number, files: Files, optimisation?: Optimisation) =>
		answer(id, async (signal) => {
			const onStep = (step: Step) => port.post({ type: 'step', id, step: strip(step) });
			const { ok, hex, elf, map } = await codal.compile(files, { signal, optimisation, onStep });
			// The CODAL package's own copy, about 2 MB, so it moves rather than copies.
			return { reply: { type: 'done', id, outcome: { ok, hex, elf, map } }, transfer: elf ? [elf.buffer as ArrayBuffer] : [] };
		});

	const complete = (id: number, files: Files, at: Position) =>
		answer(id, async (signal) => {
			const { completions } = await codal.complete(files, { ...at, signal });
			return { reply: { type: 'completed', id, completions: completions.map(({ text: _, ...record }) => record as CompletionReport) } };
		});

	port.onMessage((message) => {
		switch (message.type) {
			case 'asset': {
				const waiting = assets.get(message.id);
				assets.delete(message.id);
				if (message.bytes) waiting?.resolve(message.bytes);
				else waiting?.reject(new Error(message.error ?? `no bytes for ${message.id}`));
				return;
			}
			case 'cancel':
				running.get(message.id)?.abort();
				return;
			case 'build':
				void build(message.id, message.files, message.optimisation);
				return;
			case 'complete':
				void complete(message.id, message.files, message.at);
		}
	});

	port.post({ type: 'ready' });

	return (reason) => port.post({ type: 'crash', reason });
}

/** The hex travels once, in the outcome, not again inside its step. */
const strip = ({ stdout, ...report }: Step): StepReport => report;
