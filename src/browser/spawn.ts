import type { CompilerWorker } from '../build/compiler';

/**
 * A script that never loads is silent on this host: the extension host hands out a nested worker
 * whose `onerror` is never wired to anything, because the real worker runs on another thread. A
 * deadline on its first message is what turns that into a failed build rather than one that waits
 * for ever. Generous, since it covers loading the bundle; the 98 MB of assets are read afterwards.
 */
const STARTUP_TIMEOUT = 15_000;

/** Starts the compiler as a nested Web Worker. */
export const spawnWorker = (script: string): CompilerWorker =>
	wrapWorker(new Worker(script, { name: 'micro:bit C++ compiler' }));

/** Split out so a test can supply a worker without a browser. */
export function wrapWorker(worker: Worker, startupTimeout = STARTUP_TIMEOUT): CompilerWorker {
	let report: (reason: string) => void = () => {};
	const silent = setTimeout(() => report('it never started, so its script may be missing'), startupTimeout);

	return {
		postMessage: (message, transfer = []) => worker.postMessage(message, transfer),
		onMessage: (listener) => {
			worker.onmessage = (event) => {
				clearTimeout(silent);
				listener(event.data);
			};
		},
		onCrash: (listener) => {
			report = listener;
			worker.onmessageerror = () => listener('a message from the compiler worker could not be read');
		},
		terminate: () => {
			clearTimeout(silent);
			worker.terminate();
		},
	};
}
