/**
 * The messages between the extension host and the compiler worker. The worker
 * has no `vscode` and no filesystem, so it asks the host for every shipped file
 * by name. On the desktop it could read them itself; paying one hop there keeps
 * the two hosts differing only in how they start a worker.
 */
import type { Result, Step } from 'microbit-clang-wasm-codal';

/**
 * User files by workspace-relative path. **Key order is link order**, because the compiler package
 * numbers the objects in the order it is handed them. Anything that rebuilds this on the way to the
 * worker has to preserve it, or the same sources stop giving the same binary.
 */
export type Files = Record<string, Uint8Array>;

/** One tool run, as the compiler package reports it, minus the hex bytes. */
export type StepReport = Omit<Step, 'stdout'>;

/**
 * What a build produced. Deliberately not the package's `steps` and `output`: the host has already
 * had every step as its own message, so repeating them here would send the whole of the compiler's
 * stderr a second time. Only the last step survives, which is what describes a failure.
 */
export interface BuildOutcome extends Omit<Result, 'steps' | 'output'> {
	lastStep: StepReport | null;
}

export type ToWorker =
	| { type: 'build'; id: number; files: Files }
	| { type: 'cancel'; id: number }
	/** The reply to an asset request: the bytes, or why there are none. */
	| { type: 'asset'; id: number; bytes?: Uint8Array; error?: string };

export type FromWorker =
	/** Sent as soon as the worker is listening, so the host knows the script loaded at all. */
	| { type: 'ready' }
	/** A request for a shipped file, as a path under `dist/assets/`. */
	| { type: 'asset'; id: number; name: string }
	| { type: 'step'; id: number; step: StepReport }
	| { type: 'done'; id: number; outcome: BuildOutcome }
	| { type: 'failed'; id: number; message: string; aborted: boolean }
	/** The worker itself is broken rather than one build, so the host drops it and starts another. */
	| { type: 'crash'; reason: string };
