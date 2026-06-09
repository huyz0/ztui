import { DefaultEventPriority } from "react-reconciler/constants";

const NoEventPriority = 0;

import { createContext } from "react";
import { App } from "../core/app.ts";
import { logger } from "../core/logger.ts";
import type { DOMNode } from "../dom/dom.ts";
import { TextNode } from "../dom/text-node.ts";
import { Widget } from "../dom/widget.ts";

// Re-exported for backward compatibility; TextNode now lives in the DOM layer.
export { TextNode };

const elementRegistry: Record<string, () => Widget> = {
  "ztui-view": () => new Widget("view"),
  "ztui-button": () => new Widget("button"),
  "ztui-label": () => new Widget("label"),
  "ztui-input": () => new Widget("input"),
  "ztui-header": () => new Widget("header"),
  "ztui-footer": () => new Widget("footer"),
};

export function registerElement(tagName: string, ctor: () => Widget) {
  elementRegistry[tagName.toLowerCase()] = ctor;
}

export function createWidgetByTagName(tagName: string): Widget | null {
  const ctor = elementRegistry[tagName.toLowerCase()];
  return ctor ? ctor() : null;
}

// Props that map to widget fields and must be reset when removed between renders.
const KNOWN_HANDLER_PROPS = [
  "onClick",
  "onKey",
  "onMouseEnter",
  "onMouseLeave",
  "onAction",
  "onChange",
  "onSelect",
  "onSortChange",
  "onViewportChange",
  "onToggle",
  "onExpandedChange",
];

function applyProps(instance: DOMNode, props: any, oldProps?: any) {
  if (instance instanceof Widget) {
    // Clear props that existed in the previous render but are now absent, so a
    // removed onClick/className/style/id doesn't linger on the reused widget.
    if (oldProps) {
      if (oldProps.id !== undefined && props.id === undefined) instance.id = "";
      if (oldProps.className !== undefined && props.className === undefined) {
        instance.classes = new Set();
      }
      if (oldProps.style !== undefined && props.style === undefined) {
        instance.style = {};
      }
      for (const handler of KNOWN_HANDLER_PROPS) {
        if (oldProps[handler] !== undefined && props[handler] === undefined) {
          (instance as any)[handler] = undefined;
        }
      }
      // NOTE: generic widget props (label, value, checked, ...) are intentionally
      // not reset here — they carry typed defaults (e.g. "" / 0 / false) and
      // forcing them to undefined breaks widgets that assume a concrete value.
    }

    if (props.id !== undefined) instance.id = props.id;
    if (props.className !== undefined) {
      const trimmed = props.className.trim();
      instance.classes = new Set(trimmed ? trimmed.split(/\s+/) : []);
    }
    if (props.style !== undefined) {
      instance.style = props.style;
    }
    if (props.onClick !== undefined) {
      instance.onClick = props.onClick;
    }
    if (props.onKey !== undefined) {
      instance.onKey = props.onKey;
    }
    if (props.onMouseEnter !== undefined) {
      instance.onMouseEnter = props.onMouseEnter;
    }
    if (props.onMouseLeave !== undefined) {
      instance.onMouseLeave = props.onMouseLeave;
    }
    if (props.onAction !== undefined) {
      (instance as any).onAction = props.onAction;
    }
    if (props.onChange !== undefined) {
      (instance as any).onChange = props.onChange;
    }
    if (props.onSelect !== undefined) {
      (instance as any).onSelect = props.onSelect;
    }
    if (props.onSortChange !== undefined) {
      (instance as any).onSortChange = props.onSortChange;
    }
    if (props.onViewportChange !== undefined) {
      (instance as any).onViewportChange = props.onViewportChange;
    }
    if (props.onToggle !== undefined) {
      (instance as any).onToggle = props.onToggle;
    }
    if (props.onExpandedChange !== undefined) {
      (instance as any).onExpandedChange = props.onExpandedChange;
    }

    // Generic prop mapping for any properties defined on the widget instance
    for (const key of Object.keys(props)) {
      if (
        key === "children" ||
        key === "style" ||
        key === "id" ||
        key === "className" ||
        key.startsWith("on")
      ) {
        continue;
      }
      if (key in instance && props[key] !== undefined) {
        (instance as any)[key] = props[key];
      }
    }
  }
}

let currentUpdatePriority = NoEventPriority;

export const hostConfig: any = {
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  supportsMicrotasks: true,
  scheduleMicrotask: queueMicrotask,

  createInstance(type: string, props: any) {
    const tagName = type.toLowerCase();
    let instance: Widget;
    if (elementRegistry[tagName]) {
      instance = elementRegistry[tagName]();
    } else {
      // Unknown tag → generic, non-rendering widget. Often a typo, so leave a
      // breadcrumb rather than failing silently.
      logger.debug("reconciler", `unknown element <${type}>; using generic Widget`);
      instance = new Widget(tagName);
    }
    applyProps(instance, props);
    return instance;
  },

  createTextInstance(text: string) {
    return new TextNode(text);
  },

  appendInitialChild(parent: DOMNode, child: DOMNode) {
    parent.appendChild(child);
  },

  finalizeInitialChildren() {
    return false;
  },

  prepareUpdate(_instance: DOMNode, _type: string, _oldProps: any, _newProps: any) {
    return true;
  },

  shouldSetTextContent() {
    return false;
  },

  getRootHostContext() {
    return {};
  },

  getChildHostContext(parentHostContext: any) {
    return parentHostContext;
  },

  getPublicInstance(instance: DOMNode) {
    return instance;
  },

  prepareForCommit() {
    return null;
  },

  resetAfterCommit() {
    App.instance?.queueRender();
  },

  appendChild(parent: DOMNode, child: DOMNode) {
    parent.appendChild(child);
  },

  appendChildToContainer(container: DOMNode, child: DOMNode) {
    container.appendChild(child);
  },

  insertBefore(parent: DOMNode, child: DOMNode, beforeChild: DOMNode) {
    parent.insertBefore(child, beforeChild);
  },

  insertInContainerBefore(container: DOMNode, child: DOMNode, beforeChild: DOMNode) {
    container.insertBefore(child, beforeChild);
  },

  removeChild(parent: DOMNode, child: DOMNode) {
    parent.removeChild(child);
  },

  removeChildFromContainer(container: DOMNode, child: DOMNode) {
    container.removeChild(child);
  },

  commitUpdate(...args: any[]) {
    let instance: DOMNode;
    let oldProps: any;
    let newProps: any;

    if (args.length === 5 && typeof args[1] === "string") {
      // Runtime signature: commitUpdate(instance, type, oldProps, newProps, internalHandle)
      instance = args[0];
      oldProps = args[2];
      newProps = args[3];
    } else {
      // Type signature: commitUpdate(instance, updatePayload, type, oldProps, newProps, internalHandle)
      instance = args[0];
      oldProps = args[3];
      newProps = args[4];
    }
    applyProps(instance, newProps, oldProps);
  },

  commitTextUpdate(textInstance: TextNode, _oldText: string, newText: string) {
    textInstance.text = newText;
  },

  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  noTimeout: -1,

  shouldAttemptEagerTransition() {
    return true;
  },

  hideInstance(instance: DOMNode) {
    if (instance instanceof Widget) {
      instance.visible = false;
    }
  },

  unhideInstance(instance: DOMNode, _props: any) {
    if (instance instanceof Widget) {
      instance.visible = true;
    }
  },

  hideTextInstance(_textInstance: TextNode) {},

  unhideTextInstance(_textInstance: TextNode, _text: string) {},

  clearContainer(container: DOMNode) {
    // Detach children so they don't retain a dangling parent pointer.
    for (const child of container.children) {
      child.parent = null;
    }
    container.children = [];
  },

  setCurrentUpdatePriority(newPriority: number) {
    currentUpdatePriority = newPriority;
  },

  getCurrentUpdatePriority: () => currentUpdatePriority,

  resolveUpdatePriority() {
    if (currentUpdatePriority !== NoEventPriority) {
      return currentUpdatePriority;
    }
    return DefaultEventPriority;
  },

  maySuspendCommit() {
    return false;
  },

  maySuspendCommitOnUpdate() {
    return false;
  },

  maySuspendCommitInSyncRender() {
    return false;
  },

  NotPendingTransition: null,
  HostTransitionContext: createContext(null) as any,
  resetFormInstance() {},
  requestPostPaintCallback() {},
  trackSchedulerEvent() {},
  resolveEventType() {
    return null;
  },
  resolveEventTimeStamp() {
    return -1.1;
  },
  preloadInstance() {
    return true;
  },
  startSuspendingCommit() {},
  suspendInstance() {},
  waitForCommitToBeReady() {
    return null;
  },
  detachDeletedInstance() {},
  rendererPackageName: "ztui",
  rendererVersion: "0.1.0",
};
