import { useMemo, useState } from "react";
import type { SortState, TableColumn } from "../src/core.ts";
import { Dock, Footer, Header, Label, Table } from "../src/react.ts";

interface Server {
  id: number;
  name: string;
  region: string;
  cpu: number;
  status: "ok" | "warn" | "down";
}

const REGIONS = ["us-east", "us-west", "eu-central", "ap-south"];
const STATUSES: Server["status"][] = ["ok", "warn", "down"];

// 50k rows — virtualization keeps this smooth.
function makeServers(n: number): Server[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    name: `srv-${String(i).padStart(5, "0")}`,
    region: REGIONS[i % REGIONS.length],
    cpu: (i * 37) % 100,
    status: STATUSES[i % STATUSES.length],
  }));
}

function TableDemo() {
  const data = useMemo(() => makeServers(50_000), []);
  const [sort, setSort] = useState<SortState | null>({ key: "cpu", direction: "desc" });
  const [selected, setSelected] = useState<Server | null>(null);

  const columns: TableColumn<Server>[] = [
    { key: "id", header: "#", width: 7, align: "right", sortable: true },
    { key: "name", header: "Name", width: 14, sortable: true },
    { key: "region", header: "Region", width: 12, sortable: true },
    { key: "cpu", header: "CPU%", width: 7, align: "right", sortable: true },
    {
      key: "status",
      header: "Status",
      width: 10,
      // A widget-bearing cell: only visible rows are materialized.
      render: (row) => (
        <Label
          style={{
            color: row.status === "ok" ? "$success" : row.status === "warn" ? "$warning" : "$error",
            bold: true,
          }}
        >
          ● {row.status}
        </Label>
      ),
    },
  ];

  return (
    <Dock style={{ background: "$surface" }}>
      <Header>🗄️ ZTUI Table — 50,000 rows, virtualized · click headers to sort</Header>
      <Footer>
        ↑/↓ select · PgUp/PgDn · Home/End · ←/→ scroll cols · Enter inspect · Ctrl+C quit ·{" "}
        {selected ? `selected: ${selected.name}` : "nothing selected"}
      </Footer>

      {/* The table is the sole non-docked child, so it fills the center. */}
      <Table
        style={{ padding: 1 }}
        data={data}
        columns={columns}
        headerStyle={{ bold: true, underline: true, color: "$secondary" }}
        sort={sort}
        onSortChange={setSort}
        onSelect={(row) => setSelected(row)}
      />
    </Dock>
  );
}

import type { Demo } from "./gallery/types.ts";

export const tableDemo: Demo = {
  id: "table",
  title: "Table",
  group: "Data",
  description: "Virtualized sortable data grid.",
  autoFocusTag: "table",
  Component: TableDemo,
};
