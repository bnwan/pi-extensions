import { describe, expect, it } from "vitest";

import { computeEvenSteps, computeSplitPlan } from "../src/split";

describe("computeSplitPlan", () => {
  it("1 pane → 2 panes: ratio 0.5 (the skill's 1→2 flow)", () => {
    const plan = computeSplitPlan([{ paneId: "p1", width: 300 }], 300, 1);
    expect(plan).toEqual({ paneId: "p1", ratio: 0.5 });
  });

  it("1 pane, 2 spawns incoming: first split keeps 2/3 (the skill's 1→2→3 flow)", () => {
    const plan = computeSplitPlan([{ paneId: "p1", width: 300 }], 300, 2);
    expect(plan).toEqual({ paneId: "p1", ratio: 0.6667 }); // new pane = 1/3 of 300
  });

  it("2 panes (2/3 + 1/3), re-spawn into the wide pane: ratio 0.5", () => {
    const panes = [
      { paneId: "p1", width: 200 },
      { paneId: "p2", width: 100 },
    ];
    const plan = computeSplitPlan(panes, 300, 1);
    expect(plan).toEqual({ paneId: "p1", ratio: 0.5 }); // new pane = 100 → three equal columns
  });

  it("3 equal panes, adding a 4th: ratio 0.25 on the first (widest on tie)", () => {
    const panes = [
      { paneId: "p1", width: 100 },
      { paneId: "p2", width: 100 },
      { paneId: "p3", width: 100 },
    ];
    const plan = computeSplitPlan(panes, 300, 1);
    expect(plan).toEqual({ paneId: "p1", ratio: 0.25 });
  });

  it("splits the widest pane, not the first", () => {
    const panes = [
      { paneId: "narrow", width: 50 },
      { paneId: "wide", width: 250 },
    ];
    const plan = computeSplitPlan(panes, 300, 1);
    expect(plan.paneId).toBe("wide");
  });

  it("matches the live markky layout (2×81 of 162)", () => {
    const panes = [
      { paneId: "wA:p1", width: 81 },
      { paneId: "wA:p8", width: 81 },
    ];
    const plan = computeSplitPlan(panes, 162, 1);
    expect(plan).toEqual({ paneId: "wA:p1", ratio: 0.3333 }); // new pane = 54 → three equal columns
  });

  it("throws on impossible layouts", () => {
    expect(() => computeSplitPlan([], 300, 1)).toThrow(/No panes/);
    expect(() => computeSplitPlan([{ paneId: "p", width: 100 }], 0, 1)).toThrow(/total width/);
    expect(() => computeSplitPlan([{ paneId: "p", width: 100 }], 100, 0)).toThrow(/remaining/);
  });
});
describe("computeEvenSteps", () => {
  // The drifted 3-column layout observed live (2026-09-02): 27/54/81 of 162.
  // Even = 54/54/54. Two nested right-splits: root (container 162, ratio 0.5)
  // and split_1 (container 81, ratio 0.3333) — captured from herdr 0.8.2.
  const DRIFTED = {
    areaX: 26,
    totalWidth: 162,
    panes: [
      { paneId: "p1", x: 26, width: 27 },
      { paneId: "pX", x: 53, width: 54 },
      { paneId: "pW", x: 107, width: 81 },
    ],
    splits: [
      { direction: "right" as const, ratio: 0.5, x: 26, width: 162 },
      { direction: "right" as const, ratio: 0.3333, x: 26, width: 81 },
    ],
  };

  it("evens the drifted live layout: two ratio-space steps", () => {
    const { steps, skipped } = computeEvenSteps(DRIFTED);
    expect(skipped).toBeNull();
    // Steps follow the splits array order (root first) and are order-independent
    // in ratio space — nested ratios survive container resizes.
    expect(steps).toEqual([
      // root: 2 panes left of its boundary inside its container of 3 → target
      // ratio 2/3; current 0.5 → grow pX (its right edge moves right).
      { pane: "pX", direction: "right", amount: 0.1667 },
      // split_1: 1 pane left of its boundary inside its container of 2 → target
      // ratio 1/2; current 0.3333 → grow p1.
      { pane: "p1", direction: "right", amount: 0.1667 },
    ]);
  });

  it("produces no steps for an already-even layout", () => {
    const even = {
      areaX: 26,
      totalWidth: 162,
      panes: [
        { paneId: "a", x: 26, width: 54 },
        { paneId: "b", x: 80, width: 54 },
        { paneId: "c", x: 134, width: 54 },
      ],
      splits: [
        { direction: "right" as const, ratio: 2 / 3, x: 26, width: 162 },
        { direction: "right" as const, ratio: 0.5, x: 26, width: 108 },
      ],
    };
    expect(computeEvenSteps(even)).toEqual({ steps: [], skipped: null });
  });

  it("shrinks an over-wide left pane: delta < 0 addresses the pane right of the boundary", () => {
    const plan = computeEvenSteps({
      areaX: 0,
      totalWidth: 100,
      panes: [
        { paneId: "wide", x: 0, width: 70 },
        { paneId: "thin", x: 70, width: 30 },
      ],
      splits: [{ direction: "right" as const, ratio: 0.7, x: 0, width: 100 }],
    });
    expect(plan.skipped).toBeNull();
    expect(plan.steps).toEqual([{ pane: "thin", direction: "left", amount: 0.2 }]);
  });

  it("bails out on a split tree that doesn't match the pane count", () => {
    const plan = computeEvenSteps({
      areaX: 0,
      totalWidth: 100,
      panes: [
        { paneId: "a", x: 0, width: 50 },
        { paneId: "b", x: 50, width: 50 },
      ],
      splits: [],
    });
    expect(plan.steps).toEqual([]);
    expect(plan.skipped).toMatch(/unexpected split tree/);
  });

  it("bails out on mixed-direction layouts (out of scope, never guessed)", () => {
    const plan = computeEvenSteps({
      areaX: 0,
      totalWidth: 100,
      panes: [
        { paneId: "a", x: 0, width: 50 },
        { paneId: "b", x: 50, width: 50 },
      ],
      splits: [{ direction: "down" as const, ratio: 0.5, x: 0, width: 100 }],
    });
    expect(plan.steps).toEqual([]);
    expect(plan.skipped).toMatch(/non-column splits/);
  });

  it("is a no-op for a single pane", () => {
    expect(
      computeEvenSteps({
        areaX: 0,
        totalWidth: 100,
        panes: [{ paneId: "only", x: 0, width: 100 }],
        splits: [],
      }),
    ).toEqual({ steps: [], skipped: null });
  });
});
