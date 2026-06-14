import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

/** Props for {@link Traceback}. */
export interface TracebackProps extends Omit<ComponentProps, "children"> {
  /** The error to render. Sets name/message/stack in one shot. */
  error?: Error;
  /** Error type, e.g. "TypeError". Overridden by `error.name` when `error` is set. */
  name?: string;
  /** Error message. Overridden by `error.message` when `error` is set. */
  message?: string;
  /** A V8-style stack string. Overridden by `error.stack` when `error` is set. */
  stack?: string;
  /** Read and show source context for the topmost in-app frame. Defaults to true. */
  showSource?: boolean;
  /** Lines of source context on each side of the failing line. Defaults to 2. */
  contextLines?: number;
}

/**
 * A rich exception / stack-trace panel — `name: message` followed by parsed
 * frames (library frames dimmed) and a few lines of syntax-highlighted source
 * around the topmost in-app frame, with a caret under the failing column.
 *
 * ```tsx
 * try { … } catch (err) { return <Traceback error={err as Error} />; }
 * ```
 */
export const Traceback = hostComponent<TracebackProps>("ztui-traceback");
