import { describe, expect, it } from "vitest";

import { buildSpawnPrompt } from "../src/prompts";
import { buildReport } from "../src/report";

describe("buildSpawnPrompt", () => {
  it("default: agent opens the PR itself and stays alive through review", () => {
    const prompt = buildSpawnPrompt({ issue: 866, worktree: "/w/markky-issue-866", gate: false });
    expect(prompt).toContain("/skill:implementer 866");
    expect(prompt).toContain("/w/markky-issue-866");
    expect(prompt).toContain("you open the PR yourself (linking #866)");
    expect(prompt).toContain("do NOT merge");
    expect(prompt).not.toContain("STOP before PR creation");
  });

  it("gate: agent stops before PR creation for manual review", () => {
    const prompt = buildSpawnPrompt({ issue: 866, worktree: "/w/markky-issue-866", gate: true });
    expect(prompt).toContain("STOP before PR creation");
    expect(prompt).toContain("high-risk (--gate) pick");
    expect(prompt).not.toContain("you open the PR yourself");
  });
});

describe("buildReport", () => {
  const picks = {
    blocked: [{ number: 900, title: "T900", waitsOn: [898] }],
    inFlight: [{ number: 866, reason: "herdr agent imp-866 (working)" }],
    ready: [
      { number: 898, title: "T898", highRisk: true, filesDetected: true },
      { number: 901, title: "T901", highRisk: false, filesDetected: false },
    ],
    picks: [
      {
        number: 898,
        title: "T898",
        files: ["apps/app/src/lib/db/db.ts"],
        unblocks: [900],
        highRisk: true,
        filesDetected: true,
      },
    ],
  };

  it("renders the skill's Step 5 report format", () => {
    const report = buildReport({
      epic: 823,
      ownerRepo: "Nwaneampeh/markky",
      syncedAt: "2026-08-29T00:00:00.000Z",
      cap: 2,
      picks,
      notes: ["herdr env off"],
      commentUpdated: true,
      commentCreated: false,
      dryRun: false,
      commentBefore: [866],
    });

    expect(report).toContain("EPIC #823 — epic-next (synced 2026-08-29T00:00:00.000Z, Nwaneampeh/markky)");
    expect(report).toContain("IN_FLIGHT: #866 (herdr agent imp-866 (working))");
    expect(report).toContain("BLOCKED:   #900 (waits #898)");
    expect(report).toContain("READY:     #898, #901");
    expect(report).toContain("NEXT UP (parallel-safe, cap=2): #898 T898");
    expect(report).toContain("#898 — unblocks #900");
    expect(report).toContain("#898 — HIGH-RISK (**/db.ts) — recommend --gate (stop before PR)");
    expect(report).toContain("PLAN COMMENT: updated (NEXT UP: #898, was #866)");
    expect(report).toContain("NOTE: herdr env off");
  });

  it("handles an empty state", () => {
    const report = buildReport({
      epic: 823,
      ownerRepo: "o/r",
      syncedAt: "t",
      cap: 2,
      picks: { blocked: [], inFlight: [], ready: [], picks: [] },
      notes: [],
      commentUpdated: false,
      commentCreated: false,
      dryRun: true,
      commentBefore: [],
    });
    expect(report).toContain("IN_FLIGHT: (none)");
    expect(report).toContain("BLOCKED:   (none)");
    expect(report).toContain("NEXT UP (parallel-safe, cap=2): (none) — nothing safe to spawn right now");
    expect(report).toContain("PLAN COMMENT: not updated (dry run)");
  });
});