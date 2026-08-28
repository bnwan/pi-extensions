import { describe, expect, it } from "vitest";

import { extractAncestry, extractBlockedBy, extractFilePaths } from "../src/issueBody";

const MARKKY_STYLE_BODY = [
  "Parent: #903 (R-41 — Button focus-ring centralization). Umbrella: #823.",
  "",
  "## Context",
  "R-41 (#903) re-themed the `Button` primitive's focus indicator ONCE to a non-coral,",
  "keyboard-only `focus-visible:ring-foreground/50`. Real-app changes:",
  "",
  "- `apps/app/src/components/ui/button.tsx`",
  "- `docs/keep-ui-decisions.md`",
  "",
  "## Real-app changes",
  "- Adjust `packages/types/src/buttonSchema.ts` (export once)",
  "Blocked by #875 and #903.",
].join("\n");

describe("extractBlockedBy", () => {
  it("extracts blocked-by refs from explicit lines", () => {
    expect(extractBlockedBy("Blocked by #875")).toEqual([875]);
    expect(extractBlockedBy("Blocked by: #875, #903")).toEqual([875, 903]);
    expect(extractBlockedBy("- After #875: re-run the suite")).toEqual([875]);
    expect(extractBlockedBy("Depends on #42")).toEqual([42]);
    expect(extractBlockedBy("Dependencies: After #7, #9")).toEqual([7, 9]);
    expect(extractBlockedBy(MARKKY_STYLE_BODY)).toEqual([875, 903]);
  });

  it("ignores prose that merely mentions issues", () => {
    expect(extractBlockedBy("Fixed in #123, follow-up in #456.")).toEqual([]);
    expect(extractBlockedBy("See the analysis in #903 for details.")).toEqual([]);
    expect(extractBlockedBy("Afterwards we can merge.")).toEqual([]);
  });

  it("handles null bodies", () => {
    expect(extractBlockedBy(null)).toEqual([]);
  });
});

describe("extractAncestry", () => {
  it("extracts umbrella and parent refs", () => {
    expect(extractAncestry("Umbrella: #823")).toEqual([823]);
    expect(extractAncestry("Parent: #903. Umbrella: #823")).toEqual([823, 903]);
    expect(extractAncestry("**Parent:** #903")).toEqual([903]);
    expect(extractAncestry(MARKKY_STYLE_BODY)).toEqual([823, 903]);
  });

  it("ignores prose mentions", () => {
    expect(extractAncestry("The parent #823 tracks this.")).toEqual([]);
  });
});

describe("extractFilePaths", () => {
  it("extracts backtick-quoted paths", () => {
    const body = "Edit `apps/app/src/lib/db/db.ts` and `docs/keep-ui-decisions.md`.";
    expect(extractFilePaths(body)).toContain("apps/app/src/lib/db/db.ts");
    expect(extractFilePaths(body)).toContain("docs/keep-ui-decisions.md");
  });

  it("extracts bare extension-bearing names from backticks", () => {
    expect(extractFilePaths("Update `package.json` and `design-tokens.css`.")).toEqual([
      "package.json",
      "design-tokens.css",
    ]);
  });

  it("extracts unquoted paths rooted at path separators", () => {
    const body = "Touch packages/types/src/buttonSchema.ts and .github/workflows/ci.yml there.";
    expect(extractFilePaths(body)).toContain("packages/types/src/buttonSchema.ts");
    expect(extractFilePaths(body)).toContain(".github/workflows/ci.yml");
  });

  it("strips ./ prefixes and skips urls and non-paths", () => {
    const body = "See `./docs/adr/0021.md` and https://example.com/foo — not `bun run test`.";
    expect(extractFilePaths(body)).toContain("docs/adr/0021.md");
    expect(extractFilePaths(body)).not.toContain("https://example.com/foo");
    expect(extractFilePaths(body)).not.toContain("bun run test");
  });

  it("extracts from the markky-style body", () => {
    const files = extractFilePaths(MARKKY_STYLE_BODY);
    expect(files).toContain("apps/app/src/components/ui/button.tsx");
    expect(files).toContain("docs/keep-ui-decisions.md");
    expect(files).toContain("packages/types/src/buttonSchema.ts");
  });

  it("handles null bodies", () => {
    expect(extractFilePaths(null)).toEqual([]);
  });
});