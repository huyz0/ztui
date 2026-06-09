import type React from "react";
import ReactReconciler from "react-reconciler";
import { ConcurrentRoot } from "react-reconciler/constants";
import { logger } from "../core/logger.ts";
import type { DOMNode } from "../dom/dom.ts";
import { hostConfig } from "./host-config.ts";

export const reconciler = ReactReconciler(hostConfig);

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
