export type SplitPlan = {
  paneId: string;
  ratio: number;
};

export type EvenStep = {
  /** Pane whose edge the resize moves. */
  pane: string;
  direction: "left" | "right" | "up" | "down";
  /** `herdr pane resize --amount` moves a boundary by this ratio DELTA of the split's container width. */
  amount: number;
};

/**
 * Compute the pane-split plan that keeps all panes equal width (skill Step 6):
 * split the WIDEST existing pane with a ratio so the new pane ends up
 * totalWidth / (panes + remaining). `remaining` is the number of agent panes
 * this invocation will end up adding, INCLUDING the one being spawned now.
 *
 * Verified flows from the skill:
 * - 1→2 (ratio 0.5) · 1→2→3 (ratios 2/3 then 0.5) · re-spawn into a 2/3|1/3 tab (ratio 0.5).
 */
export function computeSplitPlan(
  panes: { paneId: string; width: number }[],
  totalWidth: number,
  remaining: number,
): SplitPlan {
  if (panes.length === 0) {
    throw new Error("No panes in the current layout — cannot split");
  }
  if (remaining < 1) {
    throw new Error(`remaining must be >= 1 (got ${remaining})`);
  }
  if (totalWidth <= 0) {
    throw new Error(`Layout has no usable total width (${totalWidth})`);
  }

  const nFinal = panes.length + remaining;
  const target = totalWidth / nFinal;

  let widest = panes[0];
  for (const pane of panes) {
    if (pane.width > widest.width) {
      widest = pane;
    }
  }
  if (widest.width <= 0) {
    throw new Error(`Widest pane has no usable width (${widest.paneId})`);
  }

  const ratio = clamp((widest.width - target) / widest.width, 0, 1);
  return { paneId: widest.paneId, ratio: round4(ratio) };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * Compute the `herdr pane resize` steps that even a flat column layout: every
 * pane ends at totalWidth/panes, repairing drift from teardowns, manual
 * resizes, and failed-spawn retries.
 *
 * Steps live in RATIO space, not cell space: `herdr pane resize --amount` is a
 * ratio DELTA of the split's container, and herdr keeps nested split ratios
 * constant while their container resizes — so ratio-space steps are genuinely
 * order-independent (a boundary move never changes another split's ratio).
 * Each split's target ratio is panes-left-of-the-boundary / panes-in-its-
 * container, read off the final equal-column layout; the amount is
 * |target − current|. A boundary needing less than one cell of movement
 * produces no step (rounding noise).
 *
 * Only flat same-direction trees are evened (the epic flow's shape): a mixed
 * right+down tree, or a split count that doesn't match the panes, bails out
 * with a skip reason instead of guessing.
 */
export function computeEvenSteps(input: {
  areaX: number;
  totalWidth: number;
  panes: { paneId: string; x: number; width: number }[];
  splits: { direction: "right" | "down"; ratio: number; x: number; width: number }[];
}): { steps: EvenStep[]; skipped: string | null } {
  const panes = [...input.panes].sort((a, b) => a.x - b.x);
  if (panes.length <= 1) {
    return { steps: [], skipped: null };
  }
  if (input.splits.length !== panes.length - 1) {
    return {
      steps: [],
      skipped: `unexpected split tree (${input.splits.length} splits for ${panes.length} panes)`,
    };
  }
  if (input.splits.some((split) => split.direction !== "right")) {
    return { steps: [], skipped: "layout has non-column splits — even-out out of scope" };
  }

  const steps: EvenStep[] = [];
  for (const split of input.splits) {
    const containerRight = split.x + split.width;
    const inContainer = panes.filter(
      (pane) => pane.x >= split.x - 1 && pane.x + pane.width <= containerRight + 1,
    );
    if (inContainer.length < 2) {
      continue; // container doesn't wrap at least two panes — leave it
    }
    const boundary = split.x + split.ratio * split.width;
    const leftCount = inContainer.filter((pane) => pane.x + pane.width <= boundary + 1).length;
    if (leftCount < 1 || leftCount >= inContainer.length) {
      continue; // boundary not interior — leave it
    }
    const delta = leftCount / inContainer.length - split.ratio;
    if (Math.abs(delta * split.width) < 1) {
      continue; // within a cell — rounding noise
    }
    const amount = round4(Math.min(1, Math.abs(delta)));
    steps.push(
      delta > 0
        ? { pane: inContainer[leftCount - 1].paneId, direction: "right", amount }
        : { pane: inContainer[leftCount].paneId, direction: "left", amount },
    );
  }
  return { steps, skipped: null };
}