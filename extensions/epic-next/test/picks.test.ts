import { describe, expect, it } from "vitest";

import { computeNextPicks, filesOverlap, isHighRisk } from "../src/picks";
import type { CandidateInput } from "../src/types";

function candidate(number: number, files: string[], blockedBy: number[] = [], title = `Issue ${number}`): CandidateInput {
  return { number, title, files, blockedBy };
}

describe("computeNextPicks", () => {
  it("drops candidates blocked on open issues but not on merged ones", () => {
    const result = computeNextPicks({
      candidates: [candidate(1, [], [10]), candidate(2, [], [11])],
      inFlight: [],
      openIssues: new Set([1, 2, 10]),
      cap: 2,
    });
    expect(result.blocked).toEqual([{ number: 1, title: "Issue 1", waitsOn: [10] }]);
    expect(result.picks.map((p) => p.number)).toEqual([2]); // 11 is closed (merged) — not blocked
  });

  it("drops in-flight candidates with their reasons", () => {
    const result = computeNextPicks({
      candidates: [candidate(1, []), candidate(2, [])],
      inFlight: [{ number: 2, reason: "open PR #55 (markky/issue-2)" }],
      openIssues: new Set([1, 2]),
      cap: 2,
    });
    expect(result.inFlight).toEqual([{ number: 2, reason: "open PR #55 (markky/issue-2)" }]);
    expect(result.picks.map((p) => p.number)).toEqual([1]);
  });

  it("prefers the issue that unblocks the most others (highest fan-out)", () => {
    const result = computeNextPicks({
      candidates: [
        candidate(1, ["apps/a.ts"]),
        candidate(2, ["apps/b.ts"]),
        candidate(3, [], [1]),
        candidate(4, [], [1]),
        candidate(5, [], [2]),
      ],
      inFlight: [],
      openIssues: new Set([1, 2, 3, 4, 5]),
      cap: 1,
    });
    expect(result.picks[0].number).toBe(1); // unblocks #3 and #4
    expect(result.picks[0].unblocks).toEqual([3, 4]);
  });

  it("hard-refuses file overlap between picks", () => {
    const result = computeNextPicks({
      candidates: [
        candidate(1, ["apps/app/src/lib/db/db.ts"]),
        candidate(2, ["apps/app/src/lib/db/db.ts", "docs/x.md"]),
        candidate(3, ["packages/other/y.ts"]),
      ],
      inFlight: [],
      openIssues: new Set([1, 2, 3]),
      cap: 2,
    });
    expect(result.picks.map((p) => p.number)).toEqual([1, 3]);
  });

  it("refuses picks sharing a shared-infra glob even for different files", () => {
    const result = computeNextPicks({
      candidates: [
        candidate(1, ["apps/app/tsconfig.json"]),
        candidate(2, ["packages/embeddings/tsconfig.json"]),
        candidate(3, ["apps/app/src/a.ts"]),
      ],
      inFlight: [],
      openIssues: new Set([1, 2, 3]),
      cap: 2,
    });
    expect(result.picks.map((p) => p.number)).toEqual([1, 3]);
  });

  it("respects the cap", () => {
    const result = computeNextPicks({
      candidates: [candidate(1, ["a.ts"]), candidate(2, ["b.ts"]), candidate(3, ["c.ts"])],
      inFlight: [],
      openIssues: new Set([1, 2, 3]),
      cap: 2,
    });
    expect(result.picks).toHaveLength(2);
  });

  it("flags high-risk picks and missing file scope", () => {
    const result = computeNextPicks({
      candidates: [candidate(1, ["packages/types/src/a.ts"]), candidate(2, [])],
      inFlight: [],
      openIssues: new Set([1, 2]),
      cap: 2,
    });
    expect(result.picks.find((p) => p.number === 1)?.highRisk).toBe(true);
    expect(result.picks.find((p) => p.number === 2)?.filesDetected).toBe(false);
  });

  it("reports everything blocked without crashing when no pick is safe", () => {
    const result = computeNextPicks({
      candidates: [candidate(1, [], [2])],
      inFlight: [],
      openIssues: new Set([1, 2]),
      cap: 2,
    });
    expect(result.picks).toEqual([]);
    expect(result.blocked).toHaveLength(1);
    expect(result.ready).toEqual([]);
  });

  it("rejects a non-positive cap", () => {
    expect(() =>
      computeNextPicks({ candidates: [], inFlight: [], openIssues: new Set(), cap: 0 }),
    ).toThrow(/cap/);
    expect(() =>
      computeNextPicks({ candidates: [], inFlight: [], openIssues: new Set(), cap: -1 }),
    ).toThrow(/cap/);
  });
});

describe("filesOverlap", () => {
  it("detects literal and glob-level overlap", () => {
    expect(filesOverlap(["a.ts"], ["a.ts"])).toBe(true);
    expect(filesOverlap(["a.ts"], ["b.ts"])).toBe(false);
    expect(filesOverlap(["packages/types/x.ts"], ["packages/types/y.ts"])).toBe(true);
    expect(filesOverlap(["apps/x/tsconfig.json"], ["apps/y/tsconfig.json"])).toBe(true);
  });
});

describe("isHighRisk", () => {
  it("flags schema/db/types infra", () => {
    expect(isHighRisk(["apps/app/src/lib/db/db.ts"])).toBe(true);
    expect(isHighRisk(["packages/types/src/buttonSchema.ts"])).toBe(true);
    expect(isHighRisk(["apps/app/src/styles/design-tokens.css"])).toBe(true);
    expect(isHighRisk(["apps/app/src/lib/db/migrations/0001.ts"])).toBe(true);
    expect(isHighRisk(["apps/app/src/components/Foo.tsx"])).toBe(false);
  });
});