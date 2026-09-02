import {
  AGENT_PREFIX,
  DEFAULT_BASE_BRANCH,
} from "./constants";
import {
  buildIssueBranch,
  buildIssueWorktreePath,
  parseGitWorktreeList,
  repoNameFromRoot,
} from "./git";
import {
  herdrAgentPrompt,
  herdrAgentStart,
  herdrPaneClose,
  herdrPaneEvenLayout,
  herdrPaneLayout,
  herdrPaneSplit,
  isAgentStartTimeout,
  isHerdrEnv,
} from "./herdr";
import { buildSpawnPrompt } from "./prompts";
import { computeSplitPlan } from "./split";
import { shell, shellOrThrow } from "./shell";
import type { SpawnRecord } from "./types";

export type SpawnOptions = {
  issue: number;
  cwd: string;
  /** High-risk pick: the agent stops before PR creation for a manual review. */
  gate?: boolean;
  /**
   * Number of agent panes this invocation will end up adding, including this
   * one — used to equalize pane widths (1→2, 1→2→3, re-spawn flows).
   */
  remaining?: number;
  /** Split direction: "right" (default, equal columns) or "down" (narrow tabs). */
  direction?: "right" | "down";
  /** Base branch for the issue worktree (default "main"). */
  baseBranch?: string;
  notify?: (message: string) => void;
};

/**
 * Spawn one pick as a visible pi agent (skill Step 6): plain `git worktree add`
 * for isolation, a sibling pane in the CURRENT tab via herdr, a pi agent
 * started with --approve, and the implementer prompt fired without --wait so
 * multiple agents run in parallel.
 */
export function spawnPick(options: SpawnOptions): SpawnRecord {
  if (!isHerdrEnv()) {
    throw new Error(
      "epic_spawn requires running inside Herdr (HERDR_ENV=1). Start pi inside herdr to spawn visible agents.",
    );
  }

  const notify = options.notify ?? (() => {});
  const repoRoot = shellOrThrow(["git", "rev-parse", "--show-toplevel"], options.cwd);
  const repoName = repoNameFromRoot(repoRoot);
  const branch = buildIssueBranch(repoName, options.issue);
  const worktree = buildIssueWorktreePath(repoRoot, repoName, options.issue);

  // Never double-assign: refuse when the issue already has a worktree/branch.
  const worktrees = parseGitWorktreeList(
    shellOrThrow(["git", "worktree", "list", "--porcelain"], options.cwd),
  );
  if (worktrees.some((w) => w.branch === branch || w.path === worktree)) {
    throw new Error(`Issue #${options.issue} already has a worktree/branch (${branch}) — it is in flight.`);
  }

  notify(`Creating worktree ${worktree} on ${branch}…`);
  const base = options.baseBranch ?? DEFAULT_BASE_BRANCH;
  shellOrThrow(["git", "worktree", "add", "-b", branch, worktree, base], options.cwd);

  let pane: string | null = null;
  try {
    // Sibling pane in the current tab, equal-width via split ratios.
    notify("Splitting a sibling pane…");
    const direction = options.direction ?? "right";
    const remaining = Math.max(1, options.remaining ?? 1);
    // Repair accumulated drift (teardowns, manual resizes, failed-spawn
    // retries) FIRST so the widest-pane split math starts from a uniform
    // layout and lands exactly equal for every pane, not just the split pair.
    // Only for serial spawns: with remaining > 1 the layout is the expected
    // intermediate state of this invocation's split plan — even-ing it would
    // break computeSplitPlan's remaining math. Only apply when remaining === 1.
    if (remaining === 1) {
      const even = herdrPaneEvenLayout(direction);
      if (even.skipped !== null) {
        notify(`Layout even-out skipped: ${even.skipped}`);
      }
      for (const note of even.notes) {
        notify(`Layout even-out: ${note}`);
      }
    }
    const layout = herdrPaneLayout();
    const plan = computeSplitPlan(
      layout.panes,
      layout.totalWidth,
      remaining,
    );
    pane = herdrPaneSplit({
      pane: plan.paneId,
      direction,
      ratio: plan.ratio,
      cwd: worktree,
    });
    if (!pane) {
      throw new Error(
        `herdr pane split did not return a pane id (split ${plan.paneId} ratio ${plan.ratio})`,
      );
    }

    // Start the pi agent. -- --approve trusts the fresh worktree non-interactively.
    const agent = `${AGENT_PREFIX}${options.issue}`;
    notify(`Starting pi agent ${agent} in pane ${pane}…`);
    let start = herdrAgentStart(agent, pane);
    if (isAgentStartTimeout(start)) {
      // A fresh-shell startup nag (e.g. an oh-my-zsh update prompt) can eat the
      // launch input and surface as a timeout — read the pane, retry once.
      const tail = shell(["herdr", "pane", "read", pane, "--source", "visible", "--lines", "30"]);
      start = herdrAgentStart(agent, pane);
      if (isAgentStartTimeout(start)) {
        throw new Error(
          [
            `herdr agent start timed out for ${agent} in pane ${pane}.`,
            `Pane tail (inspect for a startup nag): ${tail.stdout.slice(-500)}`,
          ].join("\n"),
        );
      }
    } else if (start.exitCode !== 0) {
      throw new Error(
        `herdr agent start failed for ${agent} in pane ${pane}: ${start.stderr || start.stdout}`,
      );
    }

    // Drive it: the agent follows /skill:implementer end-to-end. Fire WITHOUT
    // --wait so multiple agents run in parallel.
    notify(`Prompting ${agent} (gate=${options.gate === true})…`);
    herdrAgentPrompt(
      agent,
      buildSpawnPrompt({ issue: options.issue, worktree, gate: options.gate === true }),
    );

    return {
      issue: options.issue,
      agent,
      worktree,
      branch,
      pane,
      gate: options.gate === true,
      spawnedAt: new Date().toISOString(),
    };
  } catch (error) {
    // Roll back everything this call created so a failed spawn never leaves an
    // orphan that blocks future runs (the in-flight guard would refuse
    // re-spawns): close the pane we split (kills a started agent), remove the
    // worktree, delete the branch.
    const paneClose = pane !== null ? herdrPaneClose(pane) : null;
    if (pane !== null && paneClose !== null && paneClose.exitCode === 0) {
      // Restore the pre-spawn widths so a failed attempt is a visual no-op.
      herdrPaneEvenLayout(options.direction ?? "right");
    }
    const removeWorktree = shell(["git", "worktree", "remove", "--force", worktree], repoRoot);
    const deleteBranch = shell(["git", "branch", "-D", branch], repoRoot);
    const rollback =
      removeWorktree.exitCode === 0 && deleteBranch.exitCode === 0
        ? `Rolled back: removed worktree ${worktree} and deleted branch ${branch}${
            paneClose !== null && paneClose.exitCode !== 0
              ? ` (pane close failed: ${paneClose.stderr})`
              : ""
          }.`
        : `Rollback INCOMPLETE (worktree ${worktree} may remain — remove it manually): ${removeWorktree.stderr} ${deleteBranch.stderr}`;
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\n${rollback}`,
    );
  }
}