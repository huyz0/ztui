import { type App, Widget } from "../../src/core.ts";

/**
 * Focus the first widget with tag `tag` (or the first focusable widget when
 * `tag` is `"@first"`), polling until React has committed the demo's tree.
 * This is the launcher-level generalization of the "auto-focus the primary
 * widget" boilerplate every interactive demo used to carry inline.
 */
export function autoFocus(app: App, tag: string, tries = 30): void {
  const attempt = () => {
    const screen = app.activeScreen;
    if (tag === "@first") {
      const focusable = screen.getFocusableWidgets();
      if (focusable.length > 0) {
        screen.focusWidget(focusable[0]);
        return;
      }
    } else {
      let found: Widget | null = null;
      screen.walk((node) => {
        if (!found && node instanceof Widget && node.tagName === tag) found = node;
      });
      if (found) {
        screen.focusWidget(found);
        return;
      }
    }
    if (tries-- > 0) setTimeout(attempt, 10);
  };
  attempt();
}
