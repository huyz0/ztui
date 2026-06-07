import type React from "react";
import ReactReconciler from "react-reconciler";
import { ConcurrentRoot } from "react-reconciler/constants";
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
    console.error,
    null,
  );

  reconciler.updateContainer(element, container, null, () => {});

  return container;
}
