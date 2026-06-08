import Prism from "prismjs";
import { describe, expect, test } from "vitest";
import { Syntax } from "./syntax.ts";

describe("Syntax Highlighting Engine", () => {
  test("highlight handles typescript code blocks", () => {
    const code = "const x = 5;\n// comment here\nconst s = 'str';";
    const rich = Syntax.highlight(code, "typescript");

    expect(rich.plain).toBe(code);
    expect(rich.spans.length).toBeGreaterThan(0);

    // Verify comment style
    const commentSpan = rich.spans.find((s) => s.style.dim === true);
    expect(commentSpan).toBeDefined();

    // Verify string style
    const stringSpan = rich.spans.find((s) => s.style.color === "$string");
    expect(stringSpan).toBeDefined();

    // Verify keyword style
    const keywordSpan = rich.spans.find((s) => s.style.bold === true);
    expect(keywordSpan).toBeDefined();
  });

  test("highlight handles other well-known languages", () => {
    // Python
    const pyCode = "def test():\n    # comment\n    return 'hello'";
    const pyRich = Syntax.highlight(pyCode, "python");
    expect(pyRich.spans.length).toBeGreaterThan(0);
    expect(pyRich.spans.some((s) => s.style.dim === true)).toBe(true); // comment

    // Rust
    const rustCode = "fn main() {\n    // comment\n    let x = 5;\n}";
    const rustRich = Syntax.highlight(rustCode, "rust");
    expect(rustRich.spans.length).toBeGreaterThan(0);

    // YAML
    const yamlCode = "name: test\nvalue: 123";
    const yamlRich = Syntax.highlight(yamlCode, "yaml");
    expect(yamlRich.spans.length).toBeGreaterThan(0);

    // SQL
    const sqlCode = "SELECT * FROM users WHERE id = 1;";
    const sqlRich = Syntax.highlight(sqlCode, "mysql");
    expect(sqlRich.spans.length).toBeGreaterThan(0);

    // PL/SQL
    const plsqlCode = "DECLARE\n  x NUMBER;\nBEGIN\n  NULL;\nEND;";
    const plsqlRich = Syntax.highlight(plsqlCode, "plsql");
    expect(plsqlRich.spans.length).toBeGreaterThan(0);

    // Other languages to hit getGrammar:
    // javascript, json, css, html (markup), go, kotlin, toml, mermaid, plantuml
    Prism.languages["plant-style"] = { keyword: /dummy/ };
    Prism.languages["plant-uml"] = { keyword: /dummy/ };
    Prism.languages.kotlin = { keyword: /dummy/ };
    Prism.languages.go = { keyword: /dummy/ };
    Prism.languages.toml = { keyword: /dummy/ };
    Prism.languages.mermaid = { keyword: /dummy/ };
    Prism.languages.java = { keyword: /dummy/ };

    expect(Syntax.highlight("const x = 1;", "javascript").spans.length).toBeGreaterThan(0);
    // biome-ignore lint/suspicious/noTemplateCurlyInString: JSX test string containing raw template string
    expect(Syntax.highlight("const x = `tpl \\${a}`;", "jsx").spans.length).toBeGreaterThan(0);
    expect(Syntax.highlight('{"a": 1}', "json").spans.length).toBeGreaterThan(0);
    expect(Syntax.highlight("body { color: red; }", "css").spans.length).toBeGreaterThan(0);
    expect(Syntax.highlight('<div class="val">test</div>', "html").spans.length).toBeGreaterThan(0);
    expect(Syntax.highlight("package dummy", "go").spans.length).toBeGreaterThan(0);
    expect(Syntax.highlight("fun dummy() {}", "kotlin").spans.length).toBeGreaterThan(0);
    expect(Syntax.highlight("name = 'dummy'", "toml").spans.length).toBeGreaterThan(0);
    expect(Syntax.highlight("graph dummy", "mermaid").spans.length).toBeGreaterThan(0);
    expect(Syntax.highlight("@startuml dummy", "plantuml").spans.length).toBeGreaterThan(0);
    expect(Syntax.highlight("SELECT * FROM x", "postgres").spans.length).toBeGreaterThan(0);
    expect(Syntax.highlight("SELECT * FROM x", "pl-sql").spans.length).toBeGreaterThan(0);
    expect(Syntax.highlight("class dummy {}", "java").spans.length).toBeGreaterThan(0);
  });

  test("highlightDiff formats added/removed lines", () => {
    const code = "@@ diff @@\n- old line\n+ new line";
    const rich = Syntax.highlight(code, "diff");

    expect(rich.plain).toBe(code);

    const addedSpan = rich.spans.find((s) => s.style.color === "$diff-added");
    expect(addedSpan).toBeDefined();

    const removedSpan = rich.spans.find((s) => s.style.color === "$diff-removed");
    expect(removedSpan).toBeDefined();

    const headerSpan = rich.spans.find((s) => s.style.color === "$diff-header");
    expect(headerSpan).toBeDefined();
  });

  test("renderToLines applies gutters and shifts spans correctly", () => {
    const code = "const x = 1;\nconst y = 2;";
    const lines = Syntax.renderToLines(code, "typescript", true);

    expect(lines.length).toBe(2);

    // Gutter text for line 1 should be "1 │ "
    expect(lines[0].plain.includes("1 │ ")).toBe(true);

    // Line 1 should have a span for the gutter, and shifted spans for the code
    expect(lines[0].spans.length).toBeGreaterThan(1);

    // First span is the gutter span (colored/dimmed)
    expect(lines[0].spans[0].start).toBe(0);
    expect(lines[0].spans[0].end).toBe(5);
    expect(lines[0].spans[0].style.dim).toBe(true);
  });
});
