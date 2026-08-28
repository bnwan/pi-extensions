import {
  buildStableReference,
  buildReport,
  type ConflictPair,
} from "./report";
import {
  buildStatusBlock,
  extractNextUp,
  extractStatusRegion,
  findPlanComment,
  spliceStatusBlock,
} from "./comment";
import { DEFAULT_CAP } from "./constants";
import {
  buildIssueWorktreePath,
  issueFromBranch,
  issueFromWorktreePath,
  parseGitWorktreeList,
  parseOwnerRepo,
  repoNameFromRoot,
} from "./git";
import {
  createIssueComment,
  isEpicLike,
  listIssueComments,
  listOpenIssues,
  listOpenPRs,
  patchIssueComment,
  timelineCrossRefs,
} from "./github";
import { herdrAgentList, isHerdrEnv } from "./herdr";
import { extractAncestry, extractBlockedBy, extractFilePaths } from "./issueBody";
import { computeNextPicks, filesOverlap } from "./picks";
import { shellOrThrow } from "./shell";
import type { CandidateInput, InFlightIssue, PicksResult } from "./types";

export type PipelineOptions = {
  epic: number;
  cwd: string;
  cap?: number;
  /** Files the extraction missed — from the orchestrator reading issue bodies. */
  extraFiles?: { issue: number; files: string[] }[];
  /** Blocked-by refs the extraction missed — from the orchestrator's judgment. */
  extraBlockedBy?: { issue: number; blockedBy: number[] }[];
  /** Issues to exclude as candidates (e.g. reclassified containers). */
  excludeIssues?: number[];
  /** Skip patching/creating the epic's plan comment. */
  dryRun?: boolean;
};

export type PipelineResult = {
  ownerRepo: string;
  epic: number;
  syncedAt: string;
  cap: number;
  picks: PicksResult;
  report: string;
  commentUpdated: boolean;
  commentCreated: boolean;
  commentBefore: number[];
  /** The previous status-region text — may carry human directives (pause/hold). */
  previousStatus: string;
  dryRun: boolean;
  notes: string[];
};

/**
 * The deterministic epic-next coordinator run (skill Steps 1–5 + 7):
 * re-sync live state (open PRs, worktrees, herdr agents, assignees), discover
 * the epic's open children via timeline cross-refs + ancestry links, extract
 * files/blocked-by from bodies, compute the parallel-safe next picks, and patch
 * the epic's living-plan comment. Recomputed from live state every run.
 */
export function runEpicPipeline(options: PipelineOptions): PipelineResult {
  const cap = options.cap ?? DEFAULT_CAP;
  const notes: string[] = [];

  // ── Repo context ─────────────────────────────────────────────────────────
  const repoRoot = shellOrThrow(["git", "rev-parse", "--show-toplevel"], options.cwd);
  const remoteUrl = shellOrThrow(["git", "config", "--get", "remote.origin.url"], options.cwd);
  const ownerRepo = parseOwnerRepo(remoteUrl);
  if (!ownerRepo) {
    throw new Error(`Could not parse owner/repo from remote origin URL: ${remoteUrl}`);
  }
  const repoName = repoNameFromRoot(repoRoot);

  // ── Step 1 — re-sync live state ──────────────────────────────────────────
  const openPRs = listOpenPRs(options.cwd);
  const openIssues = listOpenIssues(options.cwd);
  const openByNumber = new Map(openIssues.map((issue) => [issue.number, issue]));
  const worktrees = parseGitWorktreeList(
    shellOrThrow(["git", "worktree", "list", "--porcelain"], options.cwd),
  );
  const herdrAgents = isHerdrEnv() ? herdrAgentList() : [];
  if (!isHerdrEnv()) {
    notes.push("not inside herdr (HERDR_ENV != 1) — herdr agent states not checked");
  }

  const inFlightMap = new Map<number, string>();
  for (const pr of openPRs) {
    const issue = issueFromBranch(pr.headRefName);
    if (issue !== null && !inFlightMap.has(issue)) {
      inFlightMap.set(issue, `open PR #${pr.number} (${pr.headRefName})`);
    }
  }
  for (const worktree of worktrees) {
    if (!worktree.branch) {
      continue;
    }
    const issue = issueFromBranch(worktree.branch);
    if (issue !== null && !inFlightMap.has(issue)) {
      inFlightMap.set(issue, `worktree ${worktree.branch}`);
    }
  }
  for (const agent of herdrAgents) {
    const named = agent.name?.match(/^imp-(\d+)$/);
    const issue =
      named !== undefined && named !== null
        ? Number(named[1])
        : issueFromWorktreePath(agent.cwd);
    if (issue !== null && !inFlightMap.has(issue)) {
      inFlightMap.set(issue, `herdr agent ${agent.name ?? agent.paneId} (${agent.status})`);
    }
  }
  for (const issue of openIssues) {
    if (issue.assignees.length > 0 && !inFlightMap.has(issue.number)) {
      inFlightMap.set(issue.number, `assigned to ${issue.assignees.join(", ")}`);
    }
  }

  // ── Step 2 — discover the epic's open children ────────────────────────────
  const excluded = new Set<number>([options.epic, ...(options.excludeIssues ?? [])]);
  const containerSet = new Set<number>([options.epic]);
  const discovered = new Set<number>();

  const queue: number[] = [options.epic];
  while (queue.length > 0) {
    const current = queue.shift() as number;
    for (const ref of timelineCrossRefs(ownerRepo, current, options.cwd)) {
      if (excluded.has(ref) || discovered.has(ref)) {
        continue;
      }
      discovered.add(ref);
      const issue = openByNumber.get(ref);
      if (issue && isEpicLike(issue)) {
        // Sub-epic: a container — recurse into its timeline, never spawn it.
        containerSet.add(ref);
        queue.push(ref);
      }
    }
  }
  // Ancestry links: open issues whose Umbrella/Parent refs hit a container,
  // even when they never created a timeline cross-reference.
  for (const issue of openIssues) {
    if (excluded.has(issue.number) || discovered.has(issue.number)) {
      continue;
    }
    const ancestry = extractAncestry(issue.body);
    if (ancestry.some((ref) => containerSet.has(ref))) {
      discovered.add(issue.number);
    }
  }

  const candidates: CandidateInput[] = [];
  for (const number of [...discovered].sort((a, b) => a - b)) {
    if (containerSet.has(number)) {
      continue;
    }
    const issue = openByNumber.get(number);
    if (!issue) {
      continue; // closed (merged / not-planned) — no longer a candidate
    }
    candidates.push({
      number,
      title: issue.title,
      files: extractFilePaths(issue.body),
      blockedBy: extractBlockedBy(issue.body),
    });
  }

  // ── Orchestrator overrides ────────────────────────────────────────────────
  for (const extra of options.extraFiles ?? []) {
    const candidate = candidates.find((c) => c.number === extra.issue);
    if (candidate) {
      candidate.files = [...new Set([...candidate.files, ...extra.files])];
    }
  }
  for (const extra of options.extraBlockedBy ?? []) {
    const candidate = candidates.find((c) => c.number === extra.issue);
    if (candidate) {
      candidate.blockedBy = [...new Set([...candidate.blockedBy, ...extra.blockedBy])];
    }
  }

  // ── Steps 3+4 — compute parallel-safe picks ───────────────────────────────
  const openNumbers = new Set(openIssues.map((issue) => issue.number));
  const picks = computeNextPicks({
    candidates,
    inFlight: [...inFlightMap.entries()]
      .filter(([number]) => discovered.has(number) || candidates.some((c) => c.number === number))
      .map(([number, reason]) => ({ number, reason })),
    openIssues: openNumbers,
    cap,
  });

  // Conflict pairs among the ready set — parallel-safety caveats for the plan comment.
  const readyCandidates = candidates.filter((c) =>
    picks.ready.some((r) => r.number === c.number),
  );
  const conflicts: ConflictPair[] = [];
  for (let i = 0; i < readyCandidates.length; i++) {
    for (let j = i + 1; j < readyCandidates.length; j++) {
      if (filesOverlap(readyCandidates[i].files, readyCandidates[j].files)) {
        conflicts.push({ a: readyCandidates[i].number, b: readyCandidates[j].number });
      }
    }
  }

  // ── Step 7 — update the epic's living-plan comment ───────────────────────
  const syncedAt = new Date().toISOString();
  const statusBlock = buildStatusBlock({
    syncedAt,
    picks: picks.picks.map((p) => p.number),
    inFlight: picks.inFlight,
    blocked: picks.blocked,
  });
  const comments = listIssueComments(ownerRepo, options.epic, options.cwd);
  const planComment = findPlanComment(comments);
  const commentBefore = planComment ? extractNextUp(planComment.body) : [];
  const previousStatus = planComment ? extractStatusRegion(planComment.body) : "";
  if (/pause|hard stop|do not spawn|hold/i.test(previousStatus)) {
    notes.push(
      "previous status block carries a spawn directive (pause/hold) — review it with the user BEFORE spawning anything",
    );
  }

  let commentUpdated = false;
  let commentCreated = false;
  if (!options.dryRun) {
    if (planComment) {
      patchIssueComment(
        ownerRepo,
        planComment.id,
        spliceStatusBlock(planComment.body, statusBlock),
        options.cwd,
      );
      commentUpdated = true;
    } else {
      const body = [statusBlock, "", buildStableReference(picks, conflicts)].join("\n");
      createIssueComment(ownerRepo, options.epic, body, options.cwd);
      commentCreated = true;
    }
  }

  const report = buildReport({
    epic: options.epic,
    ownerRepo,
    syncedAt,
    cap,
    picks,
    notes,
    commentUpdated,
    commentCreated,
    dryRun: options.dryRun === true,
    commentBefore,
  });

  return {
    ownerRepo,
    epic: options.epic,
    syncedAt,
    cap,
    picks,
    report,
    commentUpdated,
    commentCreated,
    commentBefore,
    previousStatus,
    dryRun: options.dryRun === true,
    notes,
  };
}

/** Sibling worktree path for an issue (spawn pre-flight check helper). */
export function issueWorktreePathFor(cwd: string, issue: number): string {
  const repoRoot = shellOrThrow(["git", "rev-parse", "--show-toplevel"], cwd);
  return buildIssueWorktreePath(repoRoot, repoNameFromRoot(repoRoot), issue);
}