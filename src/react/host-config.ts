import { HostConfig } from "react-reconciler";
import { DefaultEventPriority } from "react-reconciler/constants";
const NoEventPriority = 0;
import { createContext } from "react";
import { App } from "../core/app.ts";
import { DOMNode } from "../dom/dom.ts";
import { Widget } from "../dom/widget.ts";

export class TextNode extends DOMNode {
  constructor(public text: string) {
    super("text");
  }
}

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

function applyProps(instance: DOMNode, props: any) {
  if (instance instanceof Widget) {
    if (props.id !== undefined) instance.id = props.id;
    if (props.className !== undefined) {
      instance.classes = new Set(props.className.trim().split(/\s+/));
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
    if ("value" in instance && props.value !== undefined) {
      (instance as any).value = props.value;
    }
    if ("onChange" in instance && props.onChange !== undefined) {
      (instance as any).onChange = props.onChange;
    }
    if ("name" in instance && props.name !== undefined) {
      (instance as any).name = props.name;
    }
    if ("src" in instance && props.src !== undefined) {
      (instance as any).src = props.src;
    }
    if ("buffer" in instance && props.buffer !== undefined) {
      (instance as any).buffer = props.buffer;
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

  prepareUpdate(instance: DOMNode, type: string, oldProps: any, newProps: any) {
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
    let newProps: any;

    if (args.length === 5 && typeof args[1] === "string") {
      // Runtime signature: commitUpdate(instance, type, oldProps, newProps, internalHandle)
      instance = args[0];
      newProps = args[3];
    } else {
      // Type signature: commitUpdate(instance, updatePayload, type, oldProps, newProps, internalHandle)
      instance = args[0];
      newProps = args[4];
    }
    applyProps(instance, newProps);
  },

  commitTextUpdate(textInstance: TextNode, oldText: string, newText: string) {
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

  unhideInstance(instance: DOMNode, props: any) {
    if (instance instanceof Widget) {
      instance.visible = true;
    }
  },

  hideTextInstance(textInstance: TextNode) {},

  unhideTextInstance(textInstance: TextNode, text: string) {},

  clearContainer(container: DOMNode) {
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
