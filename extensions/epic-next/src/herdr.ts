import { AGENT_START_TIMEOUT_MS } from "./constants";
import { expectArray, getPath, parseJsonValue } from "./json";
import { computeEvenSteps, type EvenStep } from "./split";
import { shell, shellOrThrow, type ShellResult } from "./shell";

export type HerdrAgent = {
  name: string | null;
  paneId: string;
  cwd: string;
  status: string;
  tabId: string;
};

export type HerdrPaneLayout = {
  totalWidth: number;
  panes: { paneId: string; width: number }[];
  /** Full layout detail for even-out planning. */
  area: { x: number; width: number };
  paneRects: { paneId: string; x: number; width: number }[];
  splits: { direction: "right" | "down"; ratio: number; x: number; width: number }[];
  zoomed: boolean;
};

/** The epic-next extension drives herdr through its CLI. */
export function isHerdrEnv(): boolean {
  return process.env.HERDR_ENV === "1";
}

/** Parse `herdr agent list` output (agent entries under .result.agents). */
export function parseAgentList(output: string): HerdrAgent[] {
  const agentsRaw = getPath(parseJsonValue(output, "herdr agent list"), "result", "agents");
  const agents = Array.isArray(agentsRaw) ? agentsRaw : [];
  return expectArray(agents, "herdr agent list agents").flatMap((raw) => {
    const paneId = getPath(raw, "pane_id");
    const name = getPath(raw, "name");
    const cwd = getPath(raw, "cwd");
    const status = getPath(raw, "agent_status");
    const tabId = getPath(raw, "tab_id");
    if (typeof paneId !== "string") {
      return [];
    }
    return [
      {
        name: typeof name === "string" ? name : null,
        paneId,
        cwd: typeof cwd === "string" ? cwd : "",
        status: typeof status === "string" ? status : "unknown",
        tabId: typeof tabId === "string" ? tabId : "",
      },
    ];
  });
}

/** Parse `herdr pane layout --current` output (.result.layout). */
export function parsePaneLayout(output: string): HerdrPaneLayout {
  const layout = getPath(parseJsonValue(output, "herdr pane layout"), "result", "layout");
  const areaX = getPath(layout, "area", "x");
  const width = getPath(layout, "area", "width");
  const panesRaw = getPath(layout, "panes");
  const panes = Array.isArray(panesRaw) ? panesRaw : [];
  const paneRects = expectArray(panes, "herdr pane layout panes").flatMap((raw) => {
    const paneId = getPath(raw, "pane_id");
    const rect = getPath(raw, "rect");
    const x = getPath(rect, "x");
    const paneWidth = getPath(rect, "width");
    if (typeof paneId !== "string" || typeof paneWidth !== "number" || typeof x !== "number") {
      return [];
    }
    return [{ paneId, x, width: paneWidth }];
  });
  const splitsRaw = getPath(layout, "splits");
  const splits = Array.isArray(splitsRaw) ? splitsRaw : [];
  const splitRects = expectArray(splits, "herdr pane layout splits").flatMap(
    (
      raw,
    ): { direction: "right" | "down"; ratio: number; x: number; width: number }[] => {
      const direction = getPath(raw, "direction");
      const ratio = getPath(raw, "ratio");
      const rect = getPath(raw, "rect");
      const x = getPath(rect, "x");
      const splitWidth = getPath(rect, "width");
      if (typeof direction === "string" && (direction === "right" || direction === "down")) {
        if (typeof ratio !== "number" || typeof x !== "number" || typeof splitWidth !== "number") {
          return [];
        }
        return [{ direction, ratio, x, width: splitWidth }];
      }
      return [];
    },
  );
  const zoomed = getPath(layout, "zoomed");
  return {
    totalWidth: typeof width === "number" ? width : 0,
    panes: paneRects.map((pane) => ({ paneId: pane.paneId, width: pane.width })),
    area: {
      x: typeof areaX === "number" ? areaX : 0,
      width: typeof width === "number" ? width : 0,
    },
    paneRects,
    splits: splitRects,
    zoomed: zoomed === true,
  };
}

/** Parse `herdr pane split` output (.result.pane.pane_id). */
export function parseSplitPaneId(output: string): string | null {
  const paneId = getPath(parseJsonValue(output, "herdr pane split"), "result", "pane", "pane_id");
  return typeof paneId === "string" ? paneId : null;
}

export function herdrAgentList(): HerdrAgent[] {
  const result = shell(["herdr", "agent", "list"]);
  if (result.exitCode !== 0) {
    return [];
  }
  return parseAgentList(result.stdout);
}

export function herdrAgentGet(name: string): HerdrAgent | null {
  const result = shell(["herdr", "agent", "get", name]);
  if (result.exitCode !== 0) {
    return null;
  }
  const agent = getPath(parseJsonValue(result.stdout, "herdr agent get"), "result", "agent");
  const paneId = getPath(agent, "pane_id");
  if (typeof paneId !== "string") {
    return null;
  }
  const cwd = getPath(agent, "cwd");
  const status = getPath(agent, "agent_status");
  const tabId = getPath(agent, "tab_id");
  return {
    name,
    paneId,
    cwd: typeof cwd === "string" ? cwd : "",
    status: typeof status === "string" ? status : "unknown",
    tabId: typeof tabId === "string" ? tabId : "",
  };
}

export function herdrPaneLayout(): HerdrPaneLayout {
  return parsePaneLayout(shellOrThrow(["herdr", "pane", "layout", "--current"]));
}

export type HerdrPaneEvenResult = {
  /** Number of resize steps applied. */
  applied: number;
  /** Structural bail-out reason (null when the even-out ran or was a no-op). */
  skipped: string | null;
  /** Per-step failures (best-effort: one failed step doesn't stop the rest). */
  notes: string[];
};

/**
 * Best-effort drift repair: redistribute pane space evenly across the current
 * tab. A pane close hands the freed space to one neighbor rather than evenly,
 * and serial re-spawns only equalize the two panes each split touches — so
 * layout drift accumulates over a merge/teardown cycle. Even-out at the
 * transitions (post-close, pre-split) keeps every pane at totalWidth/panes.
 *
 * Implemented with `herdr pane resize` (herdr embeds its own tmux — there is
 * no standalone tmux binary to select-layout with). Never fatal: a failed or
 * skipped even-out is reported, not thrown.
 */
export function herdrPaneEvenLayout(direction: "right" | "down"): HerdrPaneEvenResult {
  const notes: string[] = [];
  let layout: HerdrPaneLayout;
  try {
    layout = herdrPaneLayout();
  } catch (error) {
    return {
      applied: 0,
      skipped: `layout read failed: ${error instanceof Error ? error.message : String(error)}`,
      notes,
    };
  }
  if (layout.zoomed) {
    return { applied: 0, skipped: "tab is zoomed — even-out skipped", notes };
  }
  if (direction === "down") {
    return { applied: 0, skipped: "row (direction 'down') even-out not implemented", notes };
  }
  const plan = computeEvenSteps({
    areaX: layout.area.x,
    totalWidth: layout.area.width,
    panes: layout.paneRects,
    splits: layout.splits,
  });
  if (plan.skipped !== null) {
    return { applied: 0, skipped: plan.skipped, notes };
  }
  let applied = 0;
  for (const step of plan.steps) {
    const result = shell([
      "herdr",
      "pane",
      "resize",
      "--pane",
      step.pane,
      "--direction",
      step.direction,
      "--amount",
      String(step.amount),
    ]);
    if (result.exitCode === 0) {
      applied += 1;
    } else {
      notes.push(
        `resize ${step.pane} ${step.direction} ${step.amount} failed: ${(result.stderr || result.stdout).trim()}`,
      );
    }
  }
  return { applied, skipped: null, notes };
}

export function herdrPaneSplit(options: {
  pane: string;
  direction: "right" | "down";
  ratio: number;
  cwd: string;
}): string | null {
  const out = shellOrThrow([
    "herdr",
    "pane",
    "split",
    "--pane",
    options.pane,
    "--direction",
    options.direction,
    "--ratio",
    String(options.ratio),
    "--cwd",
    options.cwd,
    "--no-focus",
  ]);
  return parseSplitPaneId(out);
}

/**
 * Start a pi agent in a pane. Returns the raw result so the caller can inspect
 * startup-nag failures (a fresh-shell prompt can eat the launch input — the
 * skill's recovery is to read the pane and retry).
 */
export function herdrAgentStart(name: string, pane: string): ShellResult {
  return shell([
    "herdr",
    "agent",
    "start",
    name,
    "--kind",
    "pi",
    "--pane",
    pane,
    "--timeout",
    String(AGENT_START_TIMEOUT_MS),
    "--",
    "--approve",
  ]);
}

/** Whether a failed `herdr agent start` result looks like the documented timeout error. */
export function isAgentStartTimeout(result: ShellResult): boolean {
  return result.stdout.includes('"code":"timeout"') || result.stderr.includes('"code":"timeout"');
}

/** Prompt an agent WITHOUT --wait so multiple agents run in parallel. */
export function herdrAgentPrompt(name: string, text: string): void {
  shellOrThrow(["herdr", "agent", "prompt", name, text]);
}

export function herdrPaneClose(pane: string): ShellResult {
  return shell(["herdr", "pane", "close", pane]);
}

/** Short tail of an agent's recent terminal output (text, ANSI stripped). */
export function herdrAgentReadTail(name: string, lines: number): string {
  const result = shell([
    "herdr",
    "agent",
    "read",
    name,
    "--source",
    "recent-unwrapped",
    "--lines",
    String(lines),
    "--format",
    "text",
  ]);
  return result.exitCode === 0 ? result.stdout : "";
}