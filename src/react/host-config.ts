import { DefaultEventPriority } from "react-reconciler/constants";

const NoEventPriority = 0;

import { createContext } from "react";
import { App } from "../core/app.ts";
import type { DOMNode } from "../dom/dom.ts";
import { createWidgetByTagName, registerElement } from "../dom/element-registry.ts";
import { TextNode } from "../dom/text-node.ts";
import { Widget } from "../dom/widget.ts";
import { logger } from "../utils/logger.ts";

// Re-exported for backward compatibility; these now live in the DOM layer so
// widget modules can register without importing the React layer.
export { createWidgetByTagName, registerElement, TextNode };

// Handler props that map 1:1 to Widget fields. Applied on every commit and
// reset when removed between renders. Typed against Widget so a typo here (or
// a handler removed from Widget) is a compile error.
const KNOWN_HANDLER_PROPS = [
  "onClick",
  "onMouseDown",
  "onKey",
  "onMouseEnter",
  "onMouseLeave",
  "onDragStart",
  "onDragMove",
  "onDragEnd",
  "onAction",
  "onChange",
  "onSelect",
  "onActivate",
  "onSortChange",
  "onToggleGroup",
  "onViewportChange",
  "onViewChange",
  "onToggle",
  "onExpandedChange",
  "onReorder",
  "onValidate",
  "onSubmit",
  "onResize",
  "onInterrupt",
  "onCommand",
  "onAttach",
  "onAttachRemove",
  "onHintsChange",
  "onDismiss",
] as const satisfies readonly (keyof Widget)[];

// Structural DOMNode/Widget internals that must never be silently overwritten
// by the generic prop mirror below — `key in instance` walks the prototype
// chain, so a JSX prop whose name coincidentally matched one of these (e.g. a
// custom widget exposing a `region` or `parent` prop) would otherwise corrupt
// the tree instead of erroring. Functions (methods) are excluded from the
// mirror separately, by type, so they don't need listing here.
const INTERNAL_FIELDS = new Set<string>([
  "parent",
  "children",
  "region",
  "prevRegion",
  "app",
  "tagName",
  "classes",
]);

function applyProps(instance: DOMNode, props: Record<string, any>, oldProps?: Record<string, any>) {
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
          instance[handler] = undefined;
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
    for (const handler of KNOWN_HANDLER_PROPS) {
      if (props[handler] !== undefined) {
        instance[handler] = props[handler];
      }
    }

    // Generic prop mapping for any properties defined on the widget instance.
    // This mirror is dynamic by design (`key in instance` gates it to fields
    // the concrete widget declares), so it needs an indexed view of the
    // instance — the one place in the binding where static typing can't reach.
    const writable: Record<string, any> = instance;
    for (const key of Object.keys(props)) {
      if (
        key === "children" ||
        key === "style" ||
        key === "id" ||
        key === "className" ||
        key.startsWith("on") ||
        INTERNAL_FIELDS.has(key)
      ) {
        continue;
      }
      if (key in instance && props[key] !== undefined && typeof writable[key] !== "function") {
        writable[key] = props[key];
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
    let instance = createWidgetByTagName(type);
    if (!instance) {
      // Unknown tag → generic, non-rendering widget. Often a typo, so leave a
      // breadcrumb rather than failing silently.
      logger.debug("reconciler", `unknown element <${type}>; using generic Widget`);
      instance = new Widget(type.toLowerCase());
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
    // Return true so the reconciler schedules commitMount for every host
    // instance, giving widgets an onMount lifecycle callback.
    return true;
  },

  commitMount(instance: DOMNode) {
    if (instance instanceof Widget) {
      instance.onMount();
    }
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

  resetAfterCommit(containerInfo: DOMNode) {
    // Queue the render on the app that owns *this* container's tree, not the
    // global singleton — otherwise a commit to one app schedules a frame on
    // whichever app was constructed last (breaks multiple concurrent apps).
    const app = containerInfo instanceof Widget ? containerInfo.app : null;
    (app ?? App.instance)?.queueRender();
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
  detachDeletedInstance(instance: DOMNode) {
    // The reconciler calls this for every host instance in a deleted subtree, so
    // each widget's onUnmount fires (cleaning up timers, overlays, etc.) without
    // us recursing here.
    if (instance instanceof Widget) {
      try {
        instance.onUnmount();
      } catch (err) {
        logger.error("reconciler", `onUnmount threw: ${instance.describe()}`, err);
      }
    }
  },
  rendererPackageName: "ztui",
  rendererVersion: "0.1.0",
};
