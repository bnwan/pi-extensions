import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { runEpicCheck, teardownIssue } from "./check";
import { runEpicPipeline } from "./pipeline";
import { spawnPick } from "./spawn";

const PICKS_DESCRIPTION = [
  "Re-sync an epic's live state (open PRs, git worktrees, herdr agents, assignees), discover its open children",
  "via timeline cross-references and Umbrella/Parent links, extract files + blocked-by from issue bodies, compute",
  "the parallel-safe NEXT UP picks (hard refuse on file overlap, skip in-flight/blocked), and patch the epic's",
  "living-plan status comment. Returns the full report. Runs gh/git/herdr — takes a few seconds.",
].join(" ");

export default function epicNextExtension(pi: ExtensionAPI) {
  // ── epic_next_picks — the deterministic coordinator run (skill steps 1–5 + 7) ──
  pi.registerTool({
    name: "epic_next_picks",
    label: "Epic next picks",
    description: PICKS_DESCRIPTION,
    promptSnippet: "Re-sync epic state and compute the parallel-safe next issues to spawn",
    promptGuidelines: [
      "Use epic_next_picks at the start of every epic-next run instead of running gh/git/herdr commands manually.",
      "When an issue body describes files or ordering in prose that the extraction missed, re-run epic_next_picks with extra_files or extra_blocked_by overrides.",
      "Treat picks flagged high-risk as --gate spawns (the agent stops before PR creation); picks with no files detected need scope verification before spawning.",
    ],
    parameters: Type.Object({
      epic_number: Type.Number({ description: "Epic issue number, e.g. 823" }),
      cap: Type.Optional(
        Type.Number({ description: "Max concurrent agent panes (default 2). Raise only when the user asks." }),
      ),
      extra_files: Type.Optional(
        Type.Array(
          Type.Object({
            issue: Type.Number({ description: "Issue number" }),
            files: Type.Array(Type.String({ description: "Repo path the body mentions" })),
          }),
          { description: "Files the extraction missed, from reading issue bodies" },
        ),
      ),
      extra_blocked_by: Type.Optional(
        Type.Array(
          Type.Object({
            issue: Type.Number({ description: "Issue number" }),
            blocked_by: Type.Array(Type.Number({ description: "Blocking issue number" })),
          }),
          { description: "Blocked-by references the extraction missed" },
        ),
      ),
      exclude_issues: Type.Optional(
        Type.Array(Type.Number(), { description: "Issue numbers to exclude as candidates" }),
      ),
      dry_run: Type.Optional(
        Type.Boolean({ description: "Compute the report without patching the plan comment" }),
      ),
    }),
    async execute(_toolCallId, params, _signal, onUpdate, ctx) {
      onUpdate?.({
        content: [{ type: "text", text: `Syncing epic #${params.epic_number} live state…` }],
        details: {},
      });
      const result = runEpicPipeline({
        epic: params.epic_number,
        cwd: ctx.cwd,
        cap: params.cap,
        extraFiles: params.extra_files,
        extraBlockedBy: params.extra_blocked_by?.map((e) => ({ issue: e.issue, blockedBy: e.blocked_by })),
        excludeIssues: params.exclude_issues,
        dryRun: params.dry_run,
      });
      return {
        content: [{ type: "text", text: result.report }],
        details: { result },
      };
    },
  });

  // ── epic_spawn — spawn one pick as a visible herdr agent (skill step 6) ──
  pi.registerTool({
    name: "epic_spawn",
    label: "Epic spawn",
    description:
      "Spawn one issue as a visible pi agent in its own worktree + herdr pane: git worktree add, equal-width sibling pane split, agent start (--approve), and the implementer prompt fired without --wait so agents run in parallel. Refuses when the issue already has a worktree/branch. Requires running inside herdr (HERDR_ENV=1).",
    promptSnippet: "Spawn an issue as a visible, isolated pi agent via herdr",
    promptGuidelines: [
      "Use epic_spawn for each confirmed NEXT UP pick after epic_next_picks — it creates the worktree, pane, and agent in one call.",
      "Pass remaining = the number of spawns this invocation will make (including this one) so pane widths come out equal, and gate=true for high-risk picks.",
    ],
    parameters: Type.Object({
      issue_number: Type.Number({ description: "Issue number to spawn" }),
      gate: Type.Optional(
        Type.Boolean({
          description: "High-risk pick: the agent stops before PR creation for a manual pre-PR review (default false)",
        }),
      ),
      remaining: Type.Optional(
        Type.Number({
          description: "How many agent panes this invocation will add including this one (default 1) — used to equalize pane widths",
        }),
      ),
      direction: Type.Optional(
        Type.String({ description: 'Pane split direction: "right" (default, equal columns) or "down" (narrow tabs)' }),
      ),
      base_branch: Type.Optional(
        Type.String({ description: "Base branch for the issue worktree (default main)" }),
      ),
    }),
    async execute(_toolCallId, params, _signal, onUpdate, ctx) {
      const direction = params.direction;
      if (direction !== undefined && direction !== "right" && direction !== "down") {
        throw new Error(`direction must be "right" or "down" (got "${direction}")`);
      }
      const record = spawnPick({
        issue: params.issue_number,
        cwd: ctx.cwd,
        gate: params.gate,
        remaining: params.remaining,
        direction,
        baseBranch: params.base_branch,
        notify: (message) => onUpdate?.({ content: [{ type: "text", text: message }], details: {} }),
      });
      pi.appendEntry("epic-next:spawn", record);
      return {
        content: [
          {
            type: "text",
            text: [
              `Spawned #${record.issue} as ${record.agent}:`,
              `  worktree: ${record.worktree}`,
              `  branch:   ${record.branch}`,
              `  pane:     ${record.pane}`,
              `  gate:     ${record.gate}`,
              "The agent follows /skill:implementer end-to-end and will report back in its pane.",
            ].join("\n"),
          },
        ],
        details: { record },
      };
    },
  });

  // ── epic_check — live status of in-flight epic work (skill "Monitoring") ──
  pi.registerTool({
    name: "epic_check",
    label: "Epic check",
    description:
      "Live status of in-flight epic work: every issue with a herdr agent, git worktree, or open PR, with the agent's current state (working/blocked/idle/done) and open PR numbers. Read-only; safe to call any time.",
    promptSnippet: "Poll live state of in-flight epic agents, worktrees, and PRs",
    promptGuidelines: [
      "Use epic_check when the user asks to check epic progress or on any epic-next re-invocation before handling completions.",
      "For an idle/done agent, read its recent output via `herdr agent read <name> --source recent-unwrapped --lines 120` in bash for its result summary.",
    ],
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const rows = runEpicCheck(ctx.cwd);
      const lines =
        rows.length === 0
          ? ["No in-flight epic work found (no imp-* agents, issue worktrees, or open issue PRs)."]
          : rows.map(formatCheckRow);
      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: { rows },
      };
    },
  });

  // ── epic_teardown — post-merge cleanup (skill step 8 §4) ──
  pi.registerTool({
    name: "epic_teardown",
    label: "Epic teardown",
    description:
      "Tear a MERGED issue down: close its herdr agent pane (only the pane whose agent cwd is the issue worktree), remove the issue worktree, delete the local branch, and prune. Use only after the issue's PR is merged — the merge itself is merge_and_cleanup's / the orchestrator's job.",
    promptSnippet: "Tear down a merged issue's agent pane, worktree, and branch",
    promptGuidelines: [
      "Use epic_teardown after the issue's PR is merged and the user asked for cleanup or the next pick should take the freed slot.",
    ],
    parameters: Type.Object({
      issue_number: Type.Number({ description: "Merged issue number to tear down" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = teardownIssue(params.issue_number, ctx.cwd);
      pi.appendEntry("epic-next:teardown", { issue: params.issue_number, ...result });
      const lines = [
        `Tore down #${params.issue_number}:`,
        `  closed pane:     ${result.closedPane ?? "(none)"}`,
        `  removed worktree: ${result.removedWorktree ?? "(none)"}`,
        `  deleted branch:  ${result.deletedBranch ?? "(none)"}`,
      ];
      for (const note of result.notes) {
        lines.push(`  note: ${note}`);
      }
      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: { result },
      };
    },
  });

  // ── /epic-check — interactive status without an LLM round-trip ──
  pi.registerCommand("epic-check", {
    description: "Show live status of in-flight epic agents, worktrees, and PRs",
    handler: async (_args, ctx) => {
      const rows = runEpicCheck(ctx.cwd);
      const text =
        rows.length === 0
          ? "No in-flight epic work found."
          : rows.map(formatCheckRow).join("\n");
      ctx.ui.notify(text, "info");
    },
  });
}

function formatCheckRow(row: {
  issue: number;
  agent: string | null;
  status: string | null;
  pane: string | null;
  worktree: string | null;
  branch: string | null;
  pr: number | null;
}): string {
  const parts = [`#${row.issue}:`];
  if (row.agent) {
    parts.push(`agent ${row.agent} [${row.status ?? "unknown"}] (pane ${row.pane ?? "?"})`);
  }
  if (row.worktree) {
    parts.push(`worktree ${row.branch ?? row.worktree}`);
  }
  if (row.pr) {
    parts.push(`open PR #${row.pr}`);
  }
  if (!row.agent && !row.worktree && !row.pr) {
    parts.push("(stale)");
  }
  return parts.join(" ");
}