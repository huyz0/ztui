---
title: Task List & Tree
description: A flat agent checklist and its hierarchical sibling for nested plans, with status glyphs and a live progress count.
---

![A ztui agent transcript whose plan is a nested task tree with status glyphs and connectors](../../../assets/widgets/tool-call.png)

`<TodoList>` mirrors an agent's plan as a compact, read-only checklist;
`<TaskTree>` is its hierarchical sibling for nested plans. Both share the same
status vocabulary — `○` pending, `◐` in-progress (emphasised), `✔` done and `✗`
cancelled (struck through) — and an optional `title` with a live `done/total`
count. Re-render with new `items` as work advances.

## TodoList

```tsx
import { TodoList } from "@huyz0/ztui/react";

<TodoList
  title="Plan"
  items={[
    { text: "Read the spec", status: "completed" },
    { text: "Implement", status: "in_progress" },
    { text: "Write tests" }, // defaults to pending
  ]}
/>;
```

A `TodoItem` is `{ text, status? }`; the `title` heading appends `done/total`.

## TaskTree

For nested plans, give each `TaskNode` a `children` array. Sub-tasks render
indented under dimmed `├─`/`└─` connectors, and the title's count spans the whole
tree:

```tsx
import { TaskTree } from "@huyz0/ztui/react";

<TaskTree
  title="Plan"
  items={[
    {
      text: "Run the test suite",
      status: "in_progress",
      children: [
        { text: "unit tests", status: "completed" },
        { text: "e2e tests" },
      ],
    },
    { text: "Clean the build dir" },
  ]}
/>;
```

```text
Plan 1/5
├─ ◐ Run the test suite
│  ├─ ✔ unit tests
│  └─ ○ e2e tests
└─ ○ Clean the build dir
```

Both components are read-only views of plan state — drive them from your agent's
task list and re-render as statuses change.

[Full demo →](https://github.com/huyz0/ztui/blob/main/examples/tool_call_demo.tsx)
