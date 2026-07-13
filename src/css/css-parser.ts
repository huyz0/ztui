export interface CSSRule {
  selector: string; // tag, .class, #id, or pseudo-classes (e.g. button:hover)
  properties: Record<string, string>;
}

export interface TCSSParsedRules extends Array<CSSRule> {
  variables?: Record<string, string>;
}

export function parseTCSS(content: string): TCSSParsedRules {
  const rules: CSSRule[] = [];
  const variables: Record<string, string> = {};

  // Remove block comments
  let cleaned = content.replace(/\/\*[\s\S]*?\*\//g, "");

  // Extract and remove top-level variables (e.g. $var: value;)
  cleaned = cleaned.replace(/^\s*\$([a-zA-Z0-9_-]+)\s*:\s*([^;]+);/gm, (_, name, value) => {
    variables[name.trim()] = value.trim();
    return "";
  });

  // Split by closing brace
  const parts = cleaned.split("}");
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const braceIdx = trimmed.indexOf("{");
    if (braceIdx === -1) continue;

    const selector = trimmed.substring(0, braceIdx).trim();
    const declsBlock = trimmed.substring(braceIdx + 1).trim();

    const properties: Record<string, string> = {};
    const decls = declsBlock.split(";");
    for (const decl of decls) {
      const pair = decl.split(":");
      if (pair.length < 2) continue;

      const key = pair[0].trim();
      const val = pair.slice(1).join(":").trim();
      if (key && val) {
        properties[key] = val;
      }
    }

    if (selector && Object.keys(properties).length > 0) {
      // A grouped selector ("h1, h2 { ... }") must become one rule per
      // comma-separated part — matching requires consuming the *entire*
      // selector string, so a bare comma left in place would make every
      // part of the group fail to match anything.
      for (const part of selector.split(",")) {
        const single = part.trim();
        if (single) rules.push({ selector: single, properties });
      }
    }
  }

  const result = rules as TCSSParsedRules;
  result.variables = variables;
  return result;
}
