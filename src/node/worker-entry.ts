/** The desktop worker's entry: a `worker_threads` port instead of the worker global. */
import { parentPort } from 'node:worker_threads';

import { serve } from '../worker/main';

if (!parentPort) throw new Error('this script only runs inside a worker thread');
const port = parentPort;

serve({
	post: (message) => port.postMessage(message),
	onMessage: (listener) => {
		port.on('message', listener);
	},
});
