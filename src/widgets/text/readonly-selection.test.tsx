import { describe, expect, test } from "vitest";
import { Markdown, RichText, Syntax } from "../../react.ts";
import "../../markdown.ts";
import "../../syntax.ts";
import { mountApp } from "../../test/harness.tsx";

/** Drive a press→drag→release over a widget's rendered cells (one row). */
function dragSelect(widget: any, fromX: number, toX: number, y: number): void {
  widget.handleMouse({ type: "press", button: "left", x: fromX, y });
  widget.handleMouse({ type: "drag", button: "left", x: toX, y });
  widget.handleMouse({ type: "release", button: "left", x: toX, y });
}

/** Collect the RichText leaves Markdown rendered, in document order. */
function richLeaves(screen: any): any[] {
  const out: any[] = [];
  screen.walk((n: any) => {
    if (n.tagName === "richtext") out.push(n);
  });
  return out;
}

describe("read-only selection — RichText", () => {
  test("drag selects rendered text and copies it (exclusive end)", async () => {
    const { findById, driver, settle } = await mountApp(<RichText id="rt">hello world</RichText>, {
      cols: 40,
      rows: 5,
    });
    const rt = findById("rt");
    await settle();
    const r = rt.getContentRect();
    dragSelect(rt, r.x, r.x + 5, r.y); // cols [0,5) = "hello"
    expect(await driver.clipboard.get()).toBe("hello");
  });

  test("a bare click (no drag) copies nothing", async () => {
    const { findById, driver, settle } = await mountApp(<RichText id="rt">hello</RichText>, {
      cols: 40,
      rows: 5,
    });
    const rt = findById("rt");
    await settle();
    driver.clipboard.set("preexisting");
    const r = rt.getContentRect();
    rt.handleMouse({ type: "press", button: "left", x: r.x, y: r.y });
    rt.handleMouse({ type: "release", button: "left", x: r.x, y: r.y });
    expect(await driver.clipboard.get()).toBe("preexisting");
  });

  test("copies the plain value, not the markup", async () => {
    const { findById, driver, settle } = await mountApp(
      <RichText id="rt">[bold]Hi[/] there</RichText>,
      { cols: 40, rows: 5 },
    );
    const rt = findById("rt");
    await settle();
    const r = rt.getContentRect();
    dragSelect(rt, r.x, r.x + 2, r.y); // "Hi" (markup is not rendered)
    expect(await driver.clipboard.get()).toBe("Hi");
  });

  test("selected cells get the theme selection background", async () => {
    const { findById, app, settle, cellAt } = await mountApp(<RichText id="rt">hello</RichText>, {
      cols: 40,
      rows: 5,
    });
    const rt = findById("rt");
    await settle();
    const r = rt.getContentRect();
    rt.handleMouse({ type: "press", button: "left", x: r.x, y: r.y });
    rt.handleMouse({ type: "drag", button: "left", x: r.x + 2, y: r.y });
    app.queueRender();
    await settle();
    const cell = cellAt(r.x, r.y);
    expect(cell.style.background).toBeDefined();
    expect(cell.style.background).not.toBe("default");
  });
});

describe("read-only selection — double/triple click", () => {
  test("double-click selects the word under the cursor", async () => {
    const { findById, driver, settle } = await mountApp(
      <RichText id="rt">the quick fox</RichText>,
      { cols: 40, rows: 5 },
    );
    const rt = findById("rt");
    await settle();
    const r = rt.getContentRect();
    // col 5 falls inside "quick"; the matching release copies the word.
    rt.handleMouse({ type: "press", button: "left", x: r.x + 5, y: r.y, clickCount: 2 });
    rt.handleMouse({ type: "release", button: "left", x: r.x + 5, y: r.y });
    expect(await driver.clipboard.get()).toBe("quick");
  });

  test("triple-click selects the whole content line", async () => {
    const { findById, driver, settle } = await mountApp(
      <RichText id="rt">the quick fox</RichText>,
      { cols: 40, rows: 5 },
    );
    const rt = findById("rt");
    await settle();
    const r = rt.getContentRect();
    rt.handleMouse({ type: "press", button: "left", x: r.x + 5, y: r.y, clickCount: 3 });
    rt.handleMouse({ type: "release", button: "left", x: r.x + 5, y: r.y });
    expect(await driver.clipboard.get()).toBe("the quick fox");
  });
});

describe("read-only selection — Syntax", () => {
  test("copies code without the line-number gutter", async () => {
    const { findById, driver, settle } = await mountApp(
      <Syntax id="sx" language="text" lineNumbers={true}>
        {"const a = 1"}
      </Syntax>,
      { cols: 40, rows: 6 },
    );
    const sx = findById("sx");
    await settle();
    const r = sx.getContentRect();
    const gutter = 5; // " 1 │ " for a single line
    dragSelect(sx, r.x + gutter, r.right - 1, r.y); // snaps to end of the code line
    expect(await driver.clipboard.get()).toBe("const a = 1");
  });

  test("a press on the line-number gutter snaps to the start of the code", async () => {
    const { findById, driver, settle } = await mountApp(
      <Syntax id="sx" language="text" lineNumbers={true}>
        {"const a = 1"}
      </Syntax>,
      { cols: 40, rows: 6 },
    );
    const sx = findById("sx");
    await settle();
    const r = sx.getContentRect();
    // Press on the gutter (col 0): the anchor snaps to the first code column, so
    // dragging to the end selects the whole line — gutter still never copied.
    dragSelect(sx, r.x, r.right - 1, r.y);
    expect(await driver.clipboard.get()).toBe("const a = 1");
  });

  test("a click on the gutter without dragging into content copies nothing", async () => {
    const { findById, driver, settle } = await mountApp(
      <Syntax id="sx" language="text" lineNumbers={true}>
        {"const a = 1"}
      </Syntax>,
      { cols: 40, rows: 6 },
    );
    const sx = findById("sx");
    await settle();
    driver.clipboard.set("kept");
    const r = sx.getContentRect();
    // Both press and drag stay on the gutter — anchor and caret snap to the same
    // content edge, so the selection is empty.
    dragSelect(sx, r.x, r.x + 2, r.y);
    expect(await driver.clipboard.get()).toBe("kept");
  });
});

describe("read-only selection — Markdown blocks", () => {
  test("dragging over a paragraph copies its plain text", async () => {
    const { driver, screen, settle, app } = await mountApp(
      <Markdown id="md">{"hello markdown"}</Markdown>,
      { cols: 40, rows: 6 },
    );
    await settle();
    const leaf = richLeaves(screen)[0];
    expect(leaf).toBeDefined();
    const r = leaf.getContentRect();
    dragSelect(leaf, r.x, r.x + 5, r.y); // "hello"
    app.queueRender();
    await settle();
    expect(await driver.clipboard.get()).toBe("hello");
  });

  test("a click on the second line of a multi-line blockquote anchors on that line", async () => {
    // A blockquote's two `>` lines share one RichText leaf as a soft-break pair.
    // Pressing the second rendered row must anchor on line 1, not snap to an
    // adjacent block — the regression behind "the drag starts from outside".
    const { app, screen, settle } = await mountApp(
      <Markdown id="md">{"> first quote line\n> second quote line\n\nafter the quote"}</Markdown>,
      { cols: 40, rows: 10 },
    );
    await settle();
    // The quote body leaf carries both lines; row 1 is its second rendered row.
    const quote = richLeaves(screen).find(
      (w) => typeof w.selectableLines === "function" && w.selectableLines().length === 2,
    );
    expect(quote).toBeDefined();
    const r = quote.getContentRect();
    app.input.handleMouse({ type: "press", button: "left", x: r.x + 3, y: r.y + 1 });
    const anchor = app.selection.active?.anchor;
    expect(anchor?.widget).toBe(quote);
    expect(anchor?.line).toBe(1); // the clicked second line, not the next block
  });

  test("dragging across blocks copies both, full interior block included", async () => {
    const { driver, screen, settle } = await mountApp(
      <Markdown id="md">{"alpha\n\nbravo\n\ncharlie"}</Markdown>,
      { cols: 40, rows: 10 },
    );
    await settle();
    const leaves = richLeaves(screen);
    expect(leaves.length).toBeGreaterThanOrEqual(3);
    const a = leaves[0].getContentRect();
    const c = leaves[2].getContentRect();
    // From "al|pha" into "cha|rlie": tail of A + full B + head of C.
    leaves[0].handleMouse({ type: "press", button: "left", x: a.x + 2, y: a.y });
    leaves[0].handleMouse({ type: "drag", button: "left", x: c.x + 3, y: c.y });
    leaves[0].handleMouse({ type: "release", button: "left", x: c.x + 3, y: c.y });
    expect(await driver.clipboard.get()).toBe("pha\nbravo\ncha");
  });

  test("a press on the bullet snaps to the item text (bullet never copied)", async () => {
    const { driver, screen, settle } = await mountApp(<Markdown id="md">{"- item one"}</Markdown>, {
      cols: 40,
      rows: 6,
    });
    await settle();
    // The first richtext leaf is the bullet ("• "), marked non-selectable; a
    // press there anchors on the item text instead. Dragging 4 columns into the
    // text selects "item" without the bullet.
    const leaves = richLeaves(screen);
    const bullet = leaves[0];
    const text = leaves[1];
    const b = bullet.getContentRect();
    const t = text.getContentRect();
    bullet.handleMouse({ type: "press", button: "left", x: b.x, y: b.y });
    bullet.handleMouse({ type: "drag", button: "left", x: t.x + 4, y: t.y });
    bullet.handleMouse({ type: "release", button: "left", x: t.x + 4, y: t.y });
    expect(await driver.clipboard.get()).toBe("item");
  });

  test("a fully covered block copies its original raw markdown", async () => {
    const { driver, screen, settle } = await mountApp(
      <Markdown id="md">{"**bold** text"}</Markdown>,
      { cols: 40, rows: 6 },
    );
    await settle();
    const leaf = richLeaves(screen)[0]; // renders as "bold text" (9 cols)
    const r = leaf.getContentRect();
    dragSelect(leaf, r.x, r.x + 9, r.y); // cover all rendered content
    // Full coverage emits the block's raw source, formatting markers intact.
    expect(await driver.clipboard.get()).toBe("**bold** text");
  });

  test("a fully covered list item copies its raw marker syntax", async () => {
    const { driver, screen, settle } = await mountApp(<Markdown id="md">{"- item one"}</Markdown>, {
      cols: 40,
      rows: 6,
    });
    await settle();
    const text = richLeaves(screen)[1]; // the item body ("item one", 8 cols)
    const t = text.getContentRect();
    dragSelect(text, t.x, t.x + 8, t.y);
    expect(await driver.clipboard.get()).toBe("- item one");
  });

  test("a partially selected block falls back to the rendered slice", async () => {
    const { driver, screen, settle } = await mountApp(
      <Markdown id="md">{"**bold** text"}</Markdown>,
      { cols: 40, rows: 6 },
    );
    await settle();
    const leaf = richLeaves(screen)[0];
    const r = leaf.getContentRect();
    dragSelect(leaf, r.x, r.x + 4, r.y); // only "bold" — not full coverage
    expect(await driver.clipboard.get()).toBe("bold");
  });
});

describe("read-only selection — off-screen / auto-scroll", () => {
  test("copy includes content scrolled off-screen (full logical range)", async () => {
    const { app, screen, settle } = await mountApp(
      <Markdown id="md" style={{ height: 3 }}>
        {"alpha\n\nbravo\n\ncharlie"}
      </Markdown>,
      { cols: 40, rows: 4 },
    );
    await settle();
    const leaves = richLeaves(screen);
    // Anchor on the first (visible) block, caret on the last block even though it
    // is below the short viewport — full-range copy reads each widget's content.
    app.selection.active = {
      group: screen.children.find((n: any) => n.tagName === "markdown") ?? leaves[0].parent,
      anchor: { widget: leaves[0], line: 0, col: 0 },
      caret: { widget: leaves[2], line: 0, col: 7 },
    };
    expect(app.copyActiveSelection()).toBe("alpha\nbravo\ncharlie");
  });

  test("dragging past the viewport bottom auto-scrolls the container", async () => {
    // Content taller than the (24-row) viewport so the container can scroll.
    const blocks = Array.from({ length: 30 }, (_, i) => `para ${i}`).join("\n\n");
    const { screen, settle } = await mountApp(<Markdown id="md">{blocks}</Markdown>, {
      cols: 40,
      rows: 24,
    });
    await settle();
    const md: any = screen.children.find((n: any) => n.tagName === "markdown");
    const leaf = richLeaves(screen)[0];
    const r = leaf.getContentRect();
    const view = md.getContentRect();
    leaf.handleMouse({ type: "press", button: "left", x: r.x, y: r.y });
    expect(md.scrollOffset.y).toBe(0);
    // Drag below the viewport bottom -> immediate auto-scroll step.
    leaf.handleMouse({ type: "drag", button: "left", x: r.x + 1, y: view.bottom + 2 });
    leaf.handleMouse({ type: "release", button: "left", x: r.x + 1, y: view.bottom + 2 });
    expect(md.scrollOffset.y).toBeGreaterThan(0);
  });
});
