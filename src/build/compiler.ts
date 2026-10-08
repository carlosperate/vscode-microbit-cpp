/**
 * The host's handle on the compiler worker. Pure: the worker and the asset
 * reads are injected, so the two entry points differ only in what they pass
 * here, and the tests pass a scripted worker.
 */
import type { BuildOutcome, CompletionReport, Files, FromWorker, Position, StepReport, ToWorker } from './protocol';

/** What each host wraps its native worker in. */
export interface CompilerWorker {
	postMessage(message: ToWorker, transfer?: ArrayBuffer[]): void;
	onMessage(listener: (message: FromWorker) => void): void;
	/** The worker died or threw outside a build; it is never used again. */
	onCrash(listener: (reason: string) => void): void;
	terminate(): void;
}

export interface CompilerOptions {
	spawn: () => CompilerWorker;
	/** Reads a file under `dist/assets/`; the name comes from the worker. */
	loadAsset: (name: string) => PromiseLike<Uint8Array>;
}

export interface BuildOptions {
	onStep?: (step: StepReport) => void;
	signal?: AbortSignal;
}

/** A build or a completion that ended without an answer: cancelled, refused or crashed. */
export class BuildError extends Error {
	constructor(
		message: string,
		readonly aborted: boolean
	) {
		super(message);
		this.name = 'BuildError';
	}
}

interface Pending {
	resolve: (answer: never) => void;
	reject: (error: Error) => void;
	onStep?: (step: StepReport) => void;
}

export class Compiler {
	#worker: CompilerWorker | null = null;
	#next = 1;
	readonly #pending = new Map<number, Pending>();

	constructor(private readonly options: CompilerOptions) {}

	build(files: Files, { onStep, signal }: BuildOptions = {}): Promise<BuildOutcome> {
		return this.#request((id) => ({ type: 'build', id, files }), signal, onStep);
	}

	/** Starts the worker if no build has yet, so the first completion waits for the compiler to load. */
	complete(files: Files, at: Position, { signal }: { signal?: AbortSignal } = {}): Promise<CompletionReport[]> {
		return this.#request((id) => ({ type: 'complete', id, files, at }), signal);
	}

	#request<Answer>(message: (id: number) => ToWorker, signal?: AbortSignal, onStep?: (step: StepReport) => void): Promise<Answer> {
		if (signal?.aborted) return Promise.reject(new BuildError('cancelled', true));
		const id = this.#next++;
		const worker = (this.#worker ??= this.#start());
		return new Promise<Answer>((resolve, reject) => {
			this.#pending.set(id, { resolve, reject, onStep });
			// The worker of the moment, not the one captured here: a cancel arriving after a crash
			// belongs to whatever is running now, if anything.
			signal?.addEventListener('abort', () => this.#worker?.postMessage({ type: 'cancel', id }), { once: true });
			worker.postMessage(message(id));
		});
	}

	dispose(): void {
		this.#worker?.terminate();
		this.#worker = null;
		this.#failAll('the extension is shutting down');
	}

	#start(): CompilerWorker {
		const worker = this.options.spawn();
		worker.onMessage((message) => this.#receive(worker, message));
		worker.onCrash((reason) => this.#crashed(worker, reason));
		return worker;
	}

	/** The one death path, whichever side noticed: the worker is dropped, never reused. */
	#crashed(worker: CompilerWorker, reason: string): void {
		if (this.#worker === worker) this.#worker = null;
		worker.terminate();
		this.#failAll(`the compiler stopped unexpectedly: ${reason}`);
	}

	#receive(worker: CompilerWorker, message: FromWorker): void {
		switch (message.type) {
			case 'ready':
				return;
			case 'crash':
				this.#crashed(worker, message.reason);
				return;
			case 'asset':
				Promise.resolve(this.options.loadAsset(message.name)).then(
					// Not transferred: `workspace.fs` hands back a view into a larger buffer, so owning
					// it would mean copying 63 MB here first. The clone copies just these bytes, there.
					(bytes) => worker.postMessage({ type: 'asset', id: message.id, bytes }),
					(error) => worker.postMessage({ type: 'asset', id: message.id, error: String(error) })
				);
				return;
			case 'step':
				this.#pending.get(message.id)?.onStep?.(message.step);
				return;
			case 'done':
				this.#settle(message.id)?.resolve(message.outcome as never);
				return;
			case 'completed':
				this.#settle(message.id)?.resolve(message.completions as never);
				return;
			case 'failed':
				this.#settle(message.id)?.reject(new BuildError(message.message, message.aborted));
				return;
		}
	}

	#settle(id: number): Pending | undefined {
		const pending = this.#pending.get(id);
		this.#pending.delete(id);
		return pending;
	}

	#failAll(reason: string): void {
		for (const pending of this.#pending.values()) pending.reject(new BuildError(reason, false));
		this.#pending.clear();
	}
}
