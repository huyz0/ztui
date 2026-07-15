import { useState } from "react";
import { DatePicker, Header, Label, VBox } from "../src/react.ts";
import type { Demo } from "./gallery/types.ts";

function DatePickerDemo() {
  const [date, setDate] = useState("2026-07-15");
  return (
    <VBox style={{ padding: 1, width: 40 }}>
      <Header>Date Picker</Header>
      <Label style={{ margin: { top: 1 } }}>Due date</Label>
      <DatePicker value={date} onChange={setDate} placeholder="Pick a date…" />
    </VBox>
  );
}

export const datePickerDemo: Demo = {
  id: "date-picker",
  title: "Date Picker",
  group: "Controls",
  description: "A field that opens a calendar popover on activate.",
  autoFocusTag: "@first",
  Component: DatePickerDemo,
};
