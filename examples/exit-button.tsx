import type { ReactNode } from "react";
import { App } from "../src/core.ts";
import type { WidgetStyles } from "../src/dom/widget.ts";
import { Button } from "../src/react.ts";

/** True on a backend that owns its host process (a terminal), where quitting is safe. */
export const canQuit = () => App.instance?.driver.capabilities.ownsProcess !== false;

/**
 * Footer hint for the quit gesture, prefixed with `sep` (default `" · "`).
 * Empty on the web backend, where there's no quit affordance and `Ctrl+C` does
 * nothing — so a footer reads naturally on both: `` `Tab focus${quitHint()}` ``
 * becomes `"Tab focus · Ctrl+C quit"` in a terminal and `"Tab focus"` on web.
 * Pass `""` for a footer whose entire content is the hint.
 */
export const quitHint = (sep = " · "): string => (canQuit() ? `${sep}Ctrl+C quit` : "");

/**
 * Quit the app — but a no-op on a backend that doesn't own its host process
 * (the web canvas), where tearing it down would kill the shared page and any
 * server behind it. Use this for keyboard-driven quits (e.g. a `q` hotkey).
 */
export function exitApp() {
  if (!canQuit()) return;
  App.instance?.stop();
  process.exit(0);
}

/**
 * A demo "Exit" button that quits the app — but renders nothing on a backend
 * that doesn't own its host process (the web canvas). There, the affordance
 * simply isn't offered; `Ctrl+C` is likewise a no-op on web.
 */
export function ExitButton({
  children = "Exit",
  style,
}: {
  children?: ReactNode;
  style?: WidgetStyles;
}) {
  if (!canQuit()) return null;
  return (
    <Button style={{ background: "$error", ...style }} onClick={exitApp}>
      {children}
    </Button>
  );
}
