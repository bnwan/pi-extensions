export type SplitPlan = {
  paneId: string;
  ratio: number;
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