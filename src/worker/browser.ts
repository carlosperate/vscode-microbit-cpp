/** The web worker's entry: the worker global is the port. */
import { serve } from './main';

const fail = serve({
	post: (message) => self.postMessage(message),
	onMessage: (listener) => {
		self.onmessage = (event: MessageEvent) => listener(event.data);
	},
});

// The host cannot see these: the extension host's nested worker leaves `onerror` unwired, because
// the real worker runs on another thread. A fault that does not reach the host as a message is a
// build that waits for ever.
self.addEventListener('error', (event) => fail(event.message || 'error in the compiler worker'));
self.addEventListener('unhandledrejection', (event) => fail(`unhandled rejection: ${String(event.reason)}`));
