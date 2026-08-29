import { AGENT_PREFIX } from "./constants";
import {
  buildIssueBranch,
  buildIssueWorktreePath,
  issueFromBranch,
  parseGitWorktreeList,
  parseOwnerRepo,
  repoNameFromRoot,
} from "./git";
import { findMergedPR, listOpenPRs } from "./github";
import { herdrAgentGet, herdrAgentList, herdrPaneClose } from "./herdr";
import { shell, shellOrThrow } from "./shell";
import type { CheckRow } from "./types";

/**
 * Live status of in-flight epic work (skill "Monitoring"): every issue with a
 * signal — herdr agent, worktree, or open PR — with its agent state.
 */
export function runEpicCheck(cwd: string): CheckRow[] {
  const agents = herdrAgentList();
  const worktrees = parseGitWorktreeList(
    shellOrThrow(["git", "worktree", "list", "--porcelain"], cwd),
  );
  const openPRs = listOpenPRs(cwd);

  const rows = new Map<number, CheckRow>();
  const touch = (issue: number): CheckRow => {
    let row = rows.get(issue);
    if (!row) {
      row = { issue, agent: null, status: null, pane: null, worktree: null, branch: null, pr: null };
      rows.set(issue, row);
    }
    return row;
  };

  for (const agent of agents) {
    const named = agent.name?.match(/^imp-(\d+)$/);
    if (named) {
      const row = touch(Number(named[1]));
      row.agent = agent.name;
      row.status = agent.status;
      row.pane = agent.paneId;
    }
  }
  for (const worktree of worktrees) {
    if (!worktree.branch) {
      continue;
    }
    const issue = issueFromBranch(worktree.branch);
    if (issue === null) {
      continue;
    }
    const row = touch(issue);
    row.worktree = worktree.path;
    row.branch = worktree.branch;
  }
  for (const pr of openPRs) {
    const issue = issueFromBranch(pr.headRefName);
    if (issue === null) {
      continue;
    }
    touch(issue).pr = pr.number;
  }

  return [...rows.values()].sort((a, b) => a.issue - b.issue);
}

export type TeardownResult = {
  closedPane: string | null;
  removedWorktree: string | null;
  deletedBranch: string | null;
  notes: string[];
};

/**
 * Tear a merged issue down (skill Step 8 §4): close the agent pane (only the
 * one whose agent cwd is the issue worktree — never the user's panes), remove
 * the worktree, delete the local branch (only when a MERGED PR exists for it),
 * and prune.
 */
export function teardownIssue(issue: number, cwd: string): TeardownResult {
  const notes: string[] = [];
  const repoRoot = shellOrThrow(["git", "rev-parse", "--show-toplevel"], cwd);
  const repoName = repoNameFromRoot(repoRoot);
  const branch = buildIssueBranch(repoName, issue);
  const worktree = buildIssueWorktreePath(repoRoot, repoName, issue);
  const agentName = `${AGENT_PREFIX}${issue}`;

  // Close the pane — only the pane whose agent cwd IS the issue worktree.
  let closedPane: string | null = null;
  const agent = herdrAgentGet(agentName);
  if (agent) {
    if (agent.cwd === worktree) {
      const close = herdrPaneClose(agent.paneId);
      closedPane = close.exitCode === 0 ? agent.paneId : null;
      if (!closedPane) {
        notes.push(`pane close failed for ${agent.paneId}: ${close.stderr || close.stdout}`);
      }
    } else {
      notes.push(
        `agent ${agentName} cwd (${agent.cwd}) is not the issue worktree (${worktree}) — pane left open`,
      );
    }
  } else {
    notes.push(`no herdr agent ${agentName} found — nothing to close`);
  }

  // Remove the worktree from the MAIN worktree first.
  let removedWorktree: string | null = null;
  const worktrees = parseGitWorktreeList(
    shellOrThrow(["git", "worktree", "list", "--porcelain"], cwd),
  );
  const existing = worktrees.find((w) => w.path === worktree || w.branch === branch);
  if (existing) {
    const remove = shell(["git", "worktree", "remove", "--force", existing.path], repoRoot);
    if (remove.exitCode === 0) {
      removedWorktree = existing.path;
    } else {
      notes.push(`worktree remove failed: ${remove.stderr || remove.stdout}`);
    }
  } else {
    notes.push(`no worktree found for ${branch} at ${worktree}`);
  }

  // Delete the local branch — only when a MERGED PR exists for it, so an
  // unmerged branch is never destroyed by a premature teardown.
  let deletedBranch: string | null = null;
  const ownerRepo = parseOwnerRepo(
    shellOrThrow(["git", "config", "--get", "remote.origin.url"], cwd),
  );
  const mergedPR =
    ownerRepo !== null ? findMergedPR(ownerRepo, branch, repoRoot) : null;
  if (mergedPR !== null) {
    const branchDelete = shell(["git", "branch", "-D", branch], repoRoot);
    if (branchDelete.exitCode === 0) {
      deletedBranch = branch;
    } else {
      notes.push(`branch delete failed: ${branchDelete.stderr || branchDelete.stdout}`);
    }
  } else {
    notes.push(
      `local branch ${branch} NOT deleted — no merged PR found for it (delete manually if appropriate)`,
    );
  }

  shell(["git", "worktree", "prune"], repoRoot);

  return { closedPane, removedWorktree, deletedBranch, notes };
}