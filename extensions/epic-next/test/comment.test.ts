import { describe, expect, it } from "vitest";

import {
  buildStatusBlock,
  extractNextUp,
  findPlanComment,
  spliceStatusBlock,
} from "../src/comment";

const STABLE_REFERENCE = "## epic-next execution plan (stable reference)\n\n- #900 waits on #898";

describe("findPlanComment", () => {
  it("finds the comment containing the status marker", () => {
    const comments = [
      { id: 1, body: "Some other comment" },
      { id: 2, body: `Intro text\n<!-- epic-next:status -->\nold\n<!-- /epic-next:status -->\n${STABLE_REFERENCE}` },
    ];
    expect(findPlanComment(comments)?.id).toBe(2);
    expect(findPlanComment([{ id: 3, body: "no markers" }])).toBeNull();
  });
});

describe("spliceStatusBlock", () => {
  const oldBlock = "<!-- epic-next:status -->\n**Synced:** old\n<!-- /epic-next:status -->";

  it("replaces only the marked region and preserves everything outside verbatim", () => {
    const body = `Header line.\n\n${oldBlock}\n\n${STABLE_REFERENCE}`;
    const newBlock = "<!-- epic-next:status -->\n**Synced:** new\n<!-- /epic-next:status -->";
    expect(spliceStatusBlock(body, newBlock)).toBe(
      `Header line.\n\n${newBlock}\n\n${STABLE_REFERENCE}`,
    );
  });

  it("appends when markers are missing", () => {
    expect(spliceStatusBlock("Existing body", oldBlock)).toBe(`Existing body\n\n${oldBlock}`);
  });

  it("appends when markers are malformed (close before open)", () => {
    const malformed = "<!-- /epic-next:status --> ... <!-- epic-next:status -->";
    expect(spliceStatusBlock(malformed, oldBlock)).toBe(`${malformed}\n\n${oldBlock}`);
  });

  it("handles an empty body", () => {
    expect(spliceStatusBlock("", oldBlock)).toBe(oldBlock);
  });
});

describe("buildStatusBlock", () => {
  it("composes the status line with all sections", () => {
    const block = buildStatusBlock({
      syncedAt: "2026-08-29T00:00:00.000Z",
      picks: [898, 901],
      inFlight: [{ number: 866, reason: "herdr agent imp-866 (working)" }],
      blocked: [{ number: 900, title: "x", waitsOn: [898] }],
    });
    expect(block).toBe(
      [
        "<!-- epic-next:status -->",
        "**Synced:** 2026-08-29T00:00:00.000Z · **NEXT UP:** #898 + #901 (parallel-safe) · " +
          "**In-flight:** #866 (herdr agent imp-866 (working)) · **Blocked:** #900→#898",
        "<!-- /epic-next:status -->",
      ].join("\n"),
    );
  });

  it("omits empty sections", () => {
    const block = buildStatusBlock({
      syncedAt: "t",
      picks: [],
      inFlight: [],
      blocked: [],
    });
    expect(block).toBe("<!-- epic-next:status -->\n**Synced:** t\n<!-- /epic-next:status -->");
  });
});

describe("extractNextUp", () => {
  it("parses NEXT UP issue numbers from a status block", () => {
    const body = [
      "Intro",
      "<!-- epic-next:status -->",
      "**Synced:** t · **NEXT UP:** #898 + #901 (parallel-safe) · **In-flight:** #1 (x)",
      "<!-- /epic-next:status -->",
      "Outro",
    ].join("\n");
    expect(extractNextUp(body)).toEqual([898, 901]);
  });

  it("returns empty when there is no NEXT UP section", () => {
    expect(extractNextUp("no status block at all")).toEqual([]);
  });
});