import { AGENT_START_TIMEOUT_MS } from "./constants";
import { expectArray, getPath, parseJsonValue } from "./json";
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
  const width = getPath(layout, "area", "width");
  const panesRaw = getPath(layout, "panes");
  const panes = Array.isArray(panesRaw) ? panesRaw : [];
  return {
    totalWidth: typeof width === "number" ? width : 0,
    panes: expectArray(panes, "herdr pane layout panes").flatMap((raw) => {
      const paneId = getPath(raw, "pane_id");
      const paneWidth = getPath(raw, "rect", "width");
      if (typeof paneId !== "string" || typeof paneWidth !== "number") {
        return [];
      }
      return [{ paneId, width: paneWidth }];
    }),
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