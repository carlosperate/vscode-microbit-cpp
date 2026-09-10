import { Worker } from 'node:worker_threads';

import type { CompilerWorker } from '../build/compiler';

/**
 * Starts the compiler in a worker thread. No startup deadline as on the web: here `error` and
 * `exit` are real events, so a script that fails to load reports itself.
 */
export function spawnWorker(script: string): CompilerWorker {
	const worker = new Worker(script);
	return {
		postMessage: (message, transfer = []) => worker.postMessage(message, transfer),
		onMessage: (listener) => {
			worker.on('message', listener);
		},
		onCrash: (listener) => {
			worker.on('error', (error) => listener(error.message));
			// Nothing asks the worker to stop except terminate(), so any exit is a crash.
			worker.on('exit', (code) => listener(`exited with code ${code}`));
		},
		terminate: () => {
			// terminate() fires 'exit', which onCrash would otherwise report as a crash. 'error' stays:
			// an emitter with no error listener throws, and a worker can fault as it is torn down.
			worker.removeAllListeners('message');
			worker.removeAllListeners('exit');
			void worker.terminate();
		},
	};
}
