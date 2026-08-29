import { describe, expect, it } from "vitest";

import { parseAgentList, parsePaneLayout, parseSplitPaneId } from "../src/herdr";

// Captured live from herdr 0.8.2 (2026-08-29).
const LIVE_AGENT_LIST = JSON.stringify({
  id: "cli:agent:list",
  result: {
    agents: [
      {
        agent: "pi",
        agent_session: {
          agent: "pi",
          kind: "path",
          source: "herdr:pi",
          value: "/sessions/main.jsonl",
        },
        agent_status: "idle",
        cwd: "/Users/x/projects/markky",
        focused: true,
        pane_id: "wA:p1",
        tab_id: "wA:t1",
      },
      {
        agent: "pi",
        agent_session: {
          agent: "pi",
          kind: "path",
          source: "herdr:pi",
          value: "/sessions/issue-866.jsonl",
        },
        agent_status: "working",
        cwd: "/Users/x/projects/markky-issue-866",
        focused: false,
        interactive_ready: true,
        name: "imp-866",
        pane_id: "wA:p8",
        tab_id: "wA:t1",
      },
    ],
    type: "agent_list",
  },
});

const LIVE_PANE_LAYOUT = JSON.stringify({
  id: "cli:pane:layout",
  result: {
    layout: {
      area: { height: 54, width: 162, x: 26, y: 1 },
      focused_pane_id: "wA:p1",
      panes: [
        { focused: true, pane_id: "wA:p1", rect: { height: 54, width: 81, x: 26, y: 1 } },
        { focused: false, pane_id: "wA:p8", rect: { height: 54, width: 81, x: 107, y: 1 } },
      ],
      splits: [
        {
          direction: "right",
          id: "split_0_root",
          ratio: 0.49999997,
          rect: { height: 54, width: 162, x: 26, y: 1 },
        },
      ],
      tab_id: "wA:t1",
      workspace_id: "wA",
      zoomed: false,
    },
    type: "pane_layout",
  },
});

describe("parseAgentList", () => {
  it("parses live agent list output", () => {
    const agents = parseAgentList(LIVE_AGENT_LIST);
    expect(agents).toEqual([
      {
        name: null,
        paneId: "wA:p1",
        cwd: "/Users/x/projects/markky",
        status: "idle",
        tabId: "wA:t1",
      },
      {
        name: "imp-866",
        paneId: "wA:p8",
        cwd: "/Users/x/projects/markky-issue-866",
        status: "working",
        tabId: "wA:t1",
      },
    ]);
  });

  it("returns [] when the result has no agents array", () => {
    expect(parseAgentList(JSON.stringify({ result: {} }))).toEqual([]);
  });

  it("throws a clear error on malformed JSON instead of silently returning []", () => {
    expect(() => parseAgentList("not json")).toThrow(/Failed to parse herdr agent list/);
  });
});

describe("parsePaneLayout", () => {
  it("parses live pane layout output", () => {
    expect(parsePaneLayout(LIVE_PANE_LAYOUT)).toEqual({
      totalWidth: 162,
      panes: [
        { paneId: "wA:p1", width: 81 },
        { paneId: "wA:p8", width: 81 },
      ],
    });
  });

  it("returns an empty layout when fields are missing", () => {
    expect(parsePaneLayout(JSON.stringify({ result: { layout: {} } }))).toEqual({
      totalWidth: 0,
      panes: [],
    });
  });

  it("throws a clear error on malformed JSON", () => {
    expect(() => parsePaneLayout("not json")).toThrow(/Failed to parse herdr pane layout/);
  });
});

describe("parseSplitPaneId", () => {
  it("parses the new pane id", () => {
    const output = JSON.stringify({ result: { pane: { pane_id: "wA:p9" } } });
    expect(parseSplitPaneId(output)).toBe("wA:p9");
  });

  it("returns null when there is no pane in the result", () => {
    expect(parseSplitPaneId(JSON.stringify({ result: {} }))).toBeNull();
  });

  it("throws a clear error on malformed JSON", () => {
    expect(() => parseSplitPaneId("not json")).toThrow(/Failed to parse herdr pane split/);
  });
});