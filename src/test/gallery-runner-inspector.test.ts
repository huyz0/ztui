import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("gallery runner inspector wiring", () => {
  test("forwards --inspector-port to App.run options", () => {
    const source = readFileSync("examples/gallery/run.tsx", "utf8");
    expect(source).toContain('arg("inspector-port")');
    expect(source).toContain("app.run({ inspectorPort:");
  });
});
