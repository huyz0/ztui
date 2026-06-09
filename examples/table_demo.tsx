import { useMemo, useState } from "react";
import {
  App,
  Button,
  Dock,
  Footer,
  Header,
  Label,
  render,
  type SortState,
  Table,
  type TableColumn,
} from "../src/index.ts";

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
            color: row.status === "ok" ? "#a6e3a1" : row.status === "warn" ? "#f9e2af" : "#f38ba8",
            bold: true,
          }}
        >
          ● {row.status}
        </Label>
      ),
    },
  ];

  return (
    <Dock style={{ background: "#11111b" }}>
      <Header>🗄️ ZTUI Table — 50,000 rows, virtualized · click headers to sort</Header>
      <Footer>
        ↑/↓ select · PgUp/PgDn · Home/End · ←/→ scroll columns · Enter to inspect ·{" "}
        {selected ? `selected: ${selected.name}` : "nothing selected"}
      </Footer>

      <Table
        style={{ height: "fr", padding: 1 }}
        data={data}
        columns={columns}
        sort={sort}
        onSortChange={setSort}
        onSelect={(row) => setSelected(row)}
      />

      <Button
        style={{ background: "#f38ba8", color: "black", width: 12, height: 1, align: "center" }}
        onClick={() => {
          App.instance?.stop();
          process.exit(0);
        }}
      >
        Exit
      </Button>
    </Dock>
  );
}

const app = new App();
render(<TableDemo />, app.activeScreen);
app.run();
