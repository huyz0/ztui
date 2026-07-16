/**
 * OSC 52 clipboard read/write, extracted from {@link BunDriver} so the driver
 * class isn't also the thing that tracks in-flight clipboard promises.
 *
 * Most terminals support OSC 52 *write* but refuse OSC 52 *read* queries
 * (disabled by default for security), so a `get()` query frequently times
 * out — falling back to a local mirror of the last write keeps in-app
 * copy→paste (and "read clipboard" demos) working even when the terminal
 * won't answer a read. Concurrent `get()` calls (e.g. rapid key-repeat
 * triggered paste checks) share one in-flight query rather than each queuing
 * its own resolver and OSC 52 write/timeout — the terminal gets one query per
 * round-trip, not N.
 */
export class ClipboardQueue {
  private lastClipboard = "";
  private pendingGet: Promise<string> | null = null;
  private pendingResolvers: ((text: string) => void)[] = [];

  /** Read the clipboard: queries the terminal, falling back to the local mirror. */
  get(write: (data: string) => void): Promise<string> {
    if (this.pendingGet) return this.pendingGet;
    const promise = new Promise<string>((resolve) => {
      // Wrap the resolver so a blocked terminal — which commonly answers an
      // OSC 52 read with an *empty* payload rather than staying silent — falls
      // back to our local mirror instead of returning "". A genuine non-empty
      // external clipboard is still honoured.
      const resolver = (osc: string) => resolve(osc || this.lastClipboard);
      this.pendingResolvers.push(resolver);
      write("\x1b]52;c;?\x07");
      setTimeout(() => {
        const idx = this.pendingResolvers.indexOf(resolver);
        if (idx !== -1) {
          this.pendingResolvers.splice(idx, 1);
          // Terminal never answered — use our local mirror.
          resolve(this.lastClipboard);
        }
      }, 500);
    });
    this.pendingGet = promise;
    promise.finally(() => {
      if (this.pendingGet === promise) this.pendingGet = null;
    });
    return promise;
  }

  /** Write the clipboard via OSC 52, mirroring locally for a read fallback. */
  set(text: string, write: (data: string) => void): void {
    this.lastClipboard = text;
    write(`\x1b]52;c;${Buffer.from(text).toString("base64")}\x07`);
  }

  /** Feed a late-arriving OSC 52 reply (base64 payload) to the oldest pending `get()`. */
  resolveReply(base64: string): void {
    const text = Buffer.from(base64, "base64").toString("utf8");
    const resolve = this.pendingResolvers.shift();
    resolve?.(text);
  }
}
