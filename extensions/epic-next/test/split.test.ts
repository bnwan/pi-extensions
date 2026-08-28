import { describe, expect, it } from "vitest";

import { computeSplitPlan } from "../src/split";

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