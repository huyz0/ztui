/**
 * Deterministic fixture for Table E2E tests.
 *
 * Runs the real framework end-to-end (real BunDriver). Renders a large,
 * virtualized table and auto-focuses it so arrow keys scroll without a Tab.
 */

import { App, type TableColumn } from "../../src/core.ts";
import type { Widget } from "../../src/dom/widget.ts";
import { Dock, Header, render, Table } from "../../src/react.ts";

interface Row {
  id: number;
  label: string;
}

const data: Row[] = Array.from({ length: 1000 }, (_, i) => ({ id: i, label: `ROW-${i}` }));

const columns: TableColumn<Row>[] = [
  { key: "id", header: "ID", width: 8, align: "right", sortable: true },
  { key: "label", header: "LABEL", width: 16, sortable: true },
];

function TableApp() {
  return (
    <Dock>
      <Header>TABLE-E2E</Header>
      <Table style={{ height: "fr" }} data={data} columns={columns} />
    </Dock>
  );
}

const app = new App();
render(<TableApp />, app.activeScreen);
app.run();

// Focus the table once it has committed so arrow keys drive it.
const focusTable = () => {
  let table: Widget | null = null;
  app.activeScreen.walk((node) => {
    if ((node as Widget).tagName === "table") table = node as Widget;
  });
  if (table) app.activeScreen.focusWidget(table);
  else setTimeout(focusTable, 10);
};
focusTable();
