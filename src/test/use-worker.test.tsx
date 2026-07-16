import { describe, expect, test } from "vitest";
import { Label } from "../react/components.tsx";
import { unmount } from "../react/reconciler.ts";
import { type UseWorkerResult, useWorker } from "../react/use-worker.ts";
import "../widgets/index.ts";
import { mountApp } from "./harness.tsx";

const OPTS = {
  cols: 40,
  rows: 6,
  capabilities: { glyphProtocol: false, graphicsProtocol: "none" as const },
};

/** A deferred promise for driving task timing from the test. */
function defer<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useWorker", () => {
  // Capture the live worker API so the test can drive run/cancel imperatively.
  let api: UseWorkerResult<string>;
  function Probe() {
    api = useWorker<string>();
    return <Label>{`${api.status}:${api.data ?? "-"}`}</Label>;
  }

  test("idle → running → success carries the result", async () => {
    const t = await mountApp(<Probe />, OPTS);
    await t.settle();
    expect(t.text()).toContain("idle:-");

    const d = defer<string>();
    const p = api.run(() => d.promise);
    await t.settle();
    expect(t.text()).toContain("running:");
    expect(api.isRunning).toBe(true);

    d.resolve("done");
    await p;
    await t.settle();
    expect(t.text()).toContain("success:done");
    expect(api.isRunning).toBe(false);
  });

  test("a rejecting task moves to error and records it", async () => {
    const t = await mountApp(<Probe />, OPTS);
    await t.settle();

    const d = defer<string>();
    const p = api.run(() => d.promise);
    await t.settle();
    d.reject(new Error("boom"));
    await p;
    await t.settle();

    expect(t.text()).toContain("error:");
    expect((api.error as Error).message).toBe("boom");
  });

  test("cancel aborts the run and the task's signal fires", async () => {
    const t = await mountApp(<Probe />, OPTS);
    await t.settle();

    let aborted = false;
    const d = defer<string>();
    // The task never settles on its own; cancel() drives the state synchronously
    // and fires the signal, so we don't await the (intentionally dangling) run.
    api.run((signal) => {
      signal.addEventListener("abort", () => {
        aborted = true;
      });
      return d.promise;
    });
    await t.settle();

    api.cancel();
    await t.settle();

    expect(aborted).toBe(true);
    expect(t.text()).toContain("cancelled:");
    expect(api.isRunning).toBe(false);
  });

  test("latest run wins: a superseded run cannot settle the state", async () => {
    const t = await mountApp(<Probe />, OPTS);
    await t.settle();

    const first = defer<string>();
    const second = defer<string>();
    const p1 = api.run(() => first.promise);
    await t.settle();
    const p2 = api.run(() => second.promise); // supersedes the first
    await t.settle();

    // Resolve the superseded run last; it must not overwrite the latest result.
    second.resolve("second");
    await p2;
    await t.settle();
    expect(t.text()).toContain("success:second");

    first.resolve("first");
    await p1;
    await t.settle();
    expect(t.text()).toContain("success:second"); // unchanged
  });

  test("cancel() with no run in flight is a no-op", async () => {
    const t = await mountApp(<Probe />, OPTS);
    await t.settle();
    expect(() => api.cancel()).not.toThrow();
    expect(t.text()).toContain("idle:-");
  });

  test("cancelling an idle-but-tracked controller doesn't flip status away from running-less state", async () => {
    // Drive a run to completion first (controllerRef cleared in `finally`),
    // then cancel again: `controller` is null so cancel() bails before ever
    // touching state - status stays "success", not "cancelled".
    const t = await mountApp(<Probe />, OPTS);
    await t.settle();
    const d = defer<string>();
    const p = api.run(() => d.promise);
    await t.settle();
    d.resolve("ok");
    await p;
    await t.settle();
    expect(t.text()).toContain("success:ok");

    api.cancel(); // controllerRef.current is already null here
    await t.settle();
    expect(t.text()).toContain("success:ok"); // unchanged, not "cancelled"
  });

  test("a superseded run that later rejects cannot settle the state as an error", async () => {
    const t = await mountApp(<Probe />, OPTS);
    await t.settle();

    const first = defer<string>();
    const second = defer<string>();
    const p1 = api.run(() => first.promise);
    await t.settle();
    const p2 = api.run(() => second.promise); // supersedes the first
    await t.settle();

    second.resolve("second");
    await p2;
    await t.settle();
    expect(t.text()).toContain("success:second");

    // The superseded first run now rejects; its catch block must see it's
    // stale (id !== runIdRef.current) and bail before touching state.
    first.reject(new Error("stale failure"));
    await p1;
    await t.settle();
    expect(t.text()).toContain("success:second"); // unchanged, no "error:"
  });

  test("reset() after unmount doesn't try to update state", async () => {
    const t = await mountApp(<Probe />, OPTS);
    await t.settle();
    const savedReset = api.reset;
    unmount(t.container);
    // mountedRef is now false; reset() must guard its setState call.
    expect(() => savedReset()).not.toThrow();
  });

  test("a task's rejection after cancel() never overwrites the cancelled state", async () => {
    // cancel() sets status to "cancelled" and bumps the run id immediately;
    // once the aborted task later rejects, its catch block must see it's
    // stale (superseded) and bail out instead of setting "error".
    const t = await mountApp(<Probe />, OPTS);
    await t.settle();

    const p = api.run(
      (signal) =>
        new Promise<string>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    await t.settle();

    api.cancel();
    await p;
    await t.settle();
    expect(t.text()).toContain("cancelled:");
    expect(api.error).toBeUndefined();
  });
});
