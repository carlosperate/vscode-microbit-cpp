/**
 * One build per folder at a time, newest wins: starting a build cancels the one
 * running for the same folder, and only the newest may touch that folder's
 * outputs.
 */
export interface Run {
	signal: AbortSignal;
	cancel: () => void;
	/**
	 * Runs `work` after every earlier build's output work for this folder, and
	 * only if this build still owns the outputs. False means it was skipped.
	 */
	publish: (work: () => Promise<void>) => Promise<boolean>;
	/** Whether this is still the newest build, which `publish` returning true does not say: one can start during the work. */
	owns: () => boolean;
	finish: () => void;
}

/** Who is building this folder, and the output work already queued for it. */
interface Folder {
	controller: AbortController;
	queue: Promise<unknown>;
}

export class BuildRuns {
	readonly #folders = new Map<string, Folder>();

	start(key: string): Run {
		const previous = this.#folders.get(key);
		previous?.controller.abort();
		const controller = new AbortController();
		this.#folders.set(key, { controller, queue: previous?.queue ?? Promise.resolve() });
		const owns = () => this.#folders.get(key)?.controller === controller;

		return {
			signal: controller.signal,
			cancel: () => controller.abort(),
			// Ownership is checked inside the queue, not before it: between deciding to write and
			// writing, a newer build can finish, and its hex is not this build's to replace.
			publish: (work) => {
				const folder = this.#folders.get(key);
				const done = (folder?.queue ?? Promise.resolve())
					.catch(() => {})
					.then(() => (owns() ? work().then(() => true) : false));
				if (folder) folder.queue = done.catch(() => {});
				return done;
			},
			owns,
			finish: () => {
				if (owns()) this.#folders.delete(key);
			},
		};
	}
}
