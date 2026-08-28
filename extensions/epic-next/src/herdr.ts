import { AGENT_START_TIMEOUT_MS } from "./constants";
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

function parseJson(output: string): Record<string, unknown> | null {
  try {
    return JSON.parse(output) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Parse `herdr agent list` output (agent entries under .result.agents). */
export function parseAgentList(output: string): HerdrAgent[] {
  const parsed = parseJson(output);
  const result = parsed?.result as { agents?: unknown[] } | undefined;
  const agents = Array.isArray(result?.agents) ? result.agents : [];
  return agents.flatMap((raw) => {
    const agent = raw as {
      name?: string;
      pane_id?: string;
      cwd?: string;
      agent_status?: string;
      tab_id?: string;
    };
    if (typeof agent.pane_id !== "string") {
      return [];
    }
    return [
      {
        name: typeof agent.name === "string" ? agent.name : null,
        paneId: agent.pane_id,
        cwd: typeof agent.cwd === "string" ? agent.cwd : "",
        status: typeof agent.agent_status === "string" ? agent.agent_status : "unknown",
        tabId: typeof agent.tab_id === "string" ? agent.tab_id : "",
      },
    ];
  });
}

/** Parse `herdr pane layout --current` output (.result.layout). */
export function parsePaneLayout(output: string): HerdrPaneLayout {
  const parsed = parseJson(output);
  const layout = (parsed?.result as { layout?: unknown } | undefined)?.layout as
    | { area?: { width?: number }; panes?: unknown[] }
    | undefined;
  const panes = Array.isArray(layout?.panes) ? layout.panes : [];
  return {
    totalWidth: typeof layout?.area?.width === "number" ? layout.area.width : 0,
    panes: panes.flatMap((raw) => {
      const pane = raw as { pane_id?: string; rect?: { width?: number } };
      if (typeof pane.pane_id !== "string" || typeof pane.rect?.width !== "number") {
        return [];
      }
      return [{ paneId: pane.pane_id, width: pane.rect.width }];
    }),
  };
}

/** Parse `herdr pane split` output (.result.pane.pane_id). */
export function parseSplitPaneId(output: string): string | null {
  const parsed = parseJson(output);
  const result = parsed?.result as { pane?: { pane_id?: string } } | undefined;
  return typeof result?.pane?.pane_id === "string" ? result.pane.pane_id : null;
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
  const parsed = parseJson(result.stdout);
  const agent = (parsed?.result as { agent?: unknown } | undefined)?.agent as
    | { pane_id?: string; cwd?: string; agent_status?: string; name?: string; tab_id?: string }
    | undefined;
  if (!agent || typeof agent.pane_id !== "string") {
    return null;
  }
  return {
    name: typeof agent.name === "string" ? agent.name : name,
    paneId: agent.pane_id,
    cwd: typeof agent.cwd === "string" ? agent.cwd : "",
    status: typeof agent.agent_status === "string" ? agent.agent_status : "unknown",
    tabId: typeof agent.tab_id === "string" ? agent.tab_id : "",
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