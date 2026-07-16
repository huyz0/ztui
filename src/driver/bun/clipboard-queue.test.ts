import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClipboardQueue } from "./clipboard-queue";

describe("ClipboardQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not hand a late reply for a timed-out query to a later query's resolver", async () => {
    const queue = new ClipboardQueue();
    const writes: string[] = [];
    const write = (data: string) => writes.push(data);

    // First query times out (terminal never answers within 500ms).
    const first = queue.get(write);
    vi.advanceTimersByTime(500);
    await expect(first).resolves.toBe(""); // falls back to empty local mirror

    // A second, unrelated query is now in flight.
    const second = queue.get(write);

    // The first query's reply arrives late, after it already timed out. It
    // must be discarded, not shifted onto the second query's resolver.
    queue.resolveReply(Buffer.from("stale-from-query-one").toString("base64"));

    // The second query's own (genuine) reply then arrives and must resolve
    // the second query, unaffected by the stale reply above.
    queue.resolveReply(Buffer.from("real-value").toString("base64"));
    await expect(second).resolves.toBe("real-value");
  });

  it("coalesces concurrent get() calls into a single in-flight query", () => {
    const queue = new ClipboardQueue();
    const writes: string[] = [];
    const write = (data: string) => writes.push(data);

    const a = queue.get(write);
    const b = queue.get(write);

    expect(a).toBe(b);
    expect(writes.length).toBe(1);
  });

  it("falls back to the local mirror set by a prior write() when the terminal is silent", async () => {
    const queue = new ClipboardQueue();
    const write = () => {};

    queue.set("hello", write);
    const p = queue.get(write);
    vi.advanceTimersByTime(500);
    await expect(p).resolves.toBe("hello");
  });
});
