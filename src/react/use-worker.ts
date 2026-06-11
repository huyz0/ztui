import { useCallback, useEffect, useRef, useState } from "react";

/** Lifecycle of the most recent {@link useWorker} run. */
export type WorkerStatus = "idle" | "running" | "success" | "error" | "cancelled";

/** A task to run: receives an {@link AbortSignal} that fires on cancel/supersede. */
export type WorkerTask<T> = (signal: AbortSignal) => Promise<T>;

export interface WorkerState<T> {
  status: WorkerStatus;
  /** Result of the last successful run; preserved across later runs until one succeeds. */
  data: T | undefined;
  /** Error thrown by the last failed run (not set for cancellations). */
  error: unknown;
  /** True while a run is in flight. */
  isRunning: boolean;
}

export interface UseWorkerResult<T> extends WorkerState<T> {
  /**
   * Start `task`. Any in-flight run is aborted first (run-exclusive), and only
   * the latest run may settle the state (latest-wins) — a superseded run's
   * result/error is discarded. Resolves with the value, or `undefined` if the
   * run was superseded, cancelled, or failed.
   */
  run: (task: WorkerTask<T>) => Promise<T | undefined>;
  /** Abort the in-flight run, moving status to `cancelled`. */
  cancel: () => void;
  /** Abort and reset back to `idle` (clears data/error). */
  reset: () => void;
}

/**
 * A cancellable async-task primitive for the UI — the agent-loop analogue of
 * Textual's `@work`. Exactly one run is in flight at a time: calling
 * {@link UseWorkerResult.run} again aborts the previous run, and a superseded
 * run can no longer change the state ("latest wins"). The task is handed an
 * {@link AbortSignal}, so well-behaved work (fetches, model calls) stops
 * promptly; the run is also aborted automatically when the component unmounts.
 *
 * ```tsx
 * const job = useWorker<string>();
 * // …
 * job.run((signal) => callModel(prompt, { signal }));
 * // render job.status / job.isRunning / job.data, and a Cancel button → job.cancel()
 * ```
 */
export function useWorker<T = unknown>(): UseWorkerResult<T> {
  const [state, setState] = useState<WorkerState<T>>({
    status: "idle",
    data: undefined,
    error: undefined,
    isRunning: false,
  });

  const controllerRef = useRef<AbortController | null>(null);
  // Monotonic id stamped on each run; a settling run must still be the latest.
  const runIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, []);

  const cancel = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    controller.abort();
    controllerRef.current = null;
    runIdRef.current++; // invalidate the in-flight run so it can't settle
    if (mountedRef.current) {
      setState((s) => (s.isRunning ? { ...s, status: "cancelled", isRunning: false } : s));
    }
  }, []);

  const run = useCallback(async (task: WorkerTask<T>): Promise<T | undefined> => {
    // Supersede any in-flight run.
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const id = ++runIdRef.current;

    setState((s) => ({ ...s, status: "running", isRunning: true, error: undefined }));

    try {
      const result = await task(controller.signal);
      if (id !== runIdRef.current || !mountedRef.current) return undefined; // superseded
      setState({ status: "success", data: result, error: undefined, isRunning: false });
      return result;
    } catch (err) {
      if (id !== runIdRef.current || !mountedRef.current) return undefined; // superseded
      if (controller.signal.aborted) {
        setState((s) => ({ ...s, status: "cancelled", isRunning: false }));
        return undefined;
      }
      setState((s) => ({ ...s, status: "error", error: err, isRunning: false }));
      return undefined;
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    cancel();
    if (mountedRef.current) {
      setState({ status: "idle", data: undefined, error: undefined, isRunning: false });
    }
  }, [cancel]);

  return { ...state, run, cancel, reset };
}
