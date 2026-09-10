/**
 * The compiler side of the protocol, run inside a worker on both hosts. It has
 * no `vscode` and no filesystem: every shipped file arrives from the host by
 * name, and the loaded compiler stays here for the life of the worker.
 */
import { setAssetLoader } from 'microbit-clang-wasm';
import { createCodal, type Step } from 'microbit-clang-wasm-codal';

import type { Files, FromWorker, StepReport, ToWorker } from '../build/protocol';

/** The worker global on the web, a `worker_threads` port on the desktop. */
export interface Port {
	post(message: FromWorker): void;
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
	const builds = new Map<number, AbortController>();

	async function run(id: number, files: Files): Promise<void> {
		const controller = new AbortController();
		builds.set(id, controller);
		try {
			const { ok, hex, map, steps } = await codal.compile(files, {
				signal: controller.signal,
				onStep: (step) => port.post({ type: 'step', id, step: strip(step) }),
			});
			const last = steps.length > 0 ? strip(steps[steps.length - 1]) : null;
			port.post({ type: 'done', id, outcome: { ok, hex, map, lastStep: last } });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			port.post({ type: 'failed', id, message, aborted: controller.signal.aborted });
		} finally {
			builds.delete(id);
		}
	}

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
				builds.get(message.id)?.abort();
				return;
			case 'build':
				void run(message.id, message.files);
		}
	});

	port.post({ type: 'ready' });

	return (reason) => port.post({ type: 'crash', reason });
}

/** The hex travels once, in the outcome, not again inside its step. */
const strip = ({ tool, args, exitCode, stderr }: Step): StepReport => ({ tool, args, exitCode, stderr });
