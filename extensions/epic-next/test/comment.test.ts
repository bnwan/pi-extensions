import { describe, expect, it } from "vitest";

import {
  buildStatusBlock,
  carriesSpawnDirective,
  extractNextUp,
  extractStatusRegion,
  findPlanComment,
  spliceStatusBlock,
} from "../src/comment";

const STABLE_REFERENCE = "## epic-next execution plan (stable reference)\n\n- #900 waits on #898";

const OPEN = "<!-- epic-next:status -->";
const CLOSE = "<!-- /epic-next:status -->";

describe("findPlanComment", () => {
  it("finds the comment containing a valid status region", () => {
    const comments = [
      { id: 1, body: "Some other comment" },
      { id: 2, body: `Intro text\n${OPEN}\nold\n${CLOSE}\n${STABLE_REFERENCE}` },
    ];
    expect(findPlanComment(comments)?.id).toBe(2);
    expect(findPlanComment([{ id: 3, body: "no markers" }])).toBeNull();
  });

  it("skips a comment that merely QUOTES the marker in prose (no close)", () => {
    const prose = "Edit only the `"
      + OPEN
      + "` block for status; preserve the reference below.";
    const comments = [
      { id: 1, body: prose },
      { id: 2, body: `${OPEN}\n**Synced:** t\n${CLOSE}\nstable` },
    ];
    expect(findPlanComment(comments)?.id).toBe(2);
    expect(findPlanComment([{ id: 3, body: prose }])).toBeNull();
  });

  it("prefers a region carrying our Synced signature when several have valid pairs", () => {
    const docQuote = `Docs say:\n\`\`\`\n${OPEN}\nquoted\n${CLOSE}\n\`\`\`\nend docs`;
    const plan = `${OPEN}\n**Synced:** t\n${CLOSE}\nstable`;
    expect(findPlanComment([{ id: 1, body: docQuote }, { id: 2, body: plan }])?.id).toBe(2);
    // fall back to the first valid pair when none carries the signature
    expect(findPlanComment([{ id: 1, body: docQuote }])?.id).toBe(1);
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

  it("splices the FIRST valid pair when a later quoted pair also exists", () => {
    const body = `${oldBlock}\nDocs quote:\n<!-- epic-next:status --> quoted <!-- /epic-next:status -->\nend`;
    const newBlock = "<!-- epic-next:status -->\n**Synced:** new\n<!-- /epic-next:status -->";
    expect(spliceStatusBlock(body, newBlock)).toBe(
      `${newBlock}\nDocs quote:\n<!-- epic-next:status --> quoted <!-- /epic-next:status -->\nend`,
    );
  });

  it("repairs an unterminated region (open marker, no close) from the marker to the end", () => {
    const body = `Header.\n${OPEN}\n**Synced:** broken`;
    const newBlock = `${OPEN}\n**Synced:** new\n${CLOSE}`;
    expect(spliceStatusBlock(body, newBlock)).toBe(`Header.\n${newBlock}`);
  });

  it("appends when there is no open marker at all", () => {
    expect(spliceStatusBlock("Existing body", oldBlock)).toBe(`Existing body\n\n${oldBlock}`);
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

describe("extractStatusRegion + carriesSpawnDirective", () => {
  it("extracts the region text between the markers", () => {
    const body = `${OPEN}\n**Synced:** t · **NEXT UP:** #1\n${CLOSE}\noutro`;
    expect(extractStatusRegion(body)).toBe("**Synced:** t · **NEXT UP:** #1");
    expect(extractStatusRegion("no markers")).toBe("");
  });

  it("detects human spawn directives in the previous status", () => {
    expect(carriesSpawnDirective("⛔ SPAWNING PAUSED — HARD STOP")).toBe(true);
    expect(carriesSpawnDirective("hold spawns until Friday")).toBe(true);
    expect(carriesSpawnDirective("do not spawn more")).toBe(true);
    expect(carriesSpawnDirective("**NEXT UP:** #1 + #2 (parallel-safe)")).toBe(false);
    expect(carriesSpawnDirective("replace the placeholder text")).toBe(false);
    expect(carriesSpawnDirective("threshold and unpause later")).toBe(false);
  });
});

describe("extractNextUp", () => {
  it("parses NEXT UP issue numbers from a status block", () => {
    const body = [
      "Intro",
      OPEN,
      "**Synced:** t · **NEXT UP:** #898 + #901 (parallel-safe) · **In-flight:** #1 (x)",
      CLOSE,
      "Outro",
    ].join("\n");
    expect(extractNextUp(body)).toEqual([898, 901]);
  });

  it("returns empty when there is no NEXT UP section", () => {
    expect(extractNextUp("no status block at all")).toEqual([]);
  });
});