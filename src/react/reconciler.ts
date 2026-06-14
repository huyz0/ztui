import type React from "react";
import ReactReconciler from "react-reconciler";
import { ConcurrentRoot } from "react-reconciler/constants";
import type { DOMNode } from "../dom/dom.ts";
import { logger } from "../utils/logger.ts";
import { hostConfig } from "./host-config.ts";

export const reconciler = ReactReconciler(hostConfig);

/**
 * Mount a React element onto a ztui node (typically `app.activeScreen`) — the
 * analogue of `createRoot().render`. Call once, then start the loop with
 * {@link App.run}.
 *
 * @param element The root React element to render.
 * @param rootNode The host node to mount into (e.g. `app.activeScreen`).
 */
export function render(element: React.ReactNode, rootNode: DOMNode): any {
  const container = reconciler.createContainer(
    rootNode,
    ConcurrentRoot,
    null,
    false,
    null,
    "",
    (error) => logger.error("react", "uncaught render error", error), // onUncaughtError
    (error) => logger.error("react", "caught render error (error boundary)", error), // onCaughtError
    (error) => logger.warn("react", "recoverable render error", error), // onRecoverableError
    () => {}, // onDefaultTransitionIndicator
  );

  reconciler.updateContainer(element, container, null, () => {});

  return container;
}

/**
 * Unmount a tree previously created with {@link render}, running effect cleanups
 * and widget `onUnmount`s. Mainly for tests, so a mounted tree doesn't linger
 * (and keep reacting to global stores) across cases.
 */
export function unmount(container: any): void {
  reconciler.updateContainer(null, container, null, () => {});
}
