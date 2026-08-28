import { HIGH_RISK_GLOBS, SHARED_INFRA_GLOBS } from "./constants";
import { matchesGlob } from "./glob";
import type { BlockedEntry, CandidateInput, InFlightIssue, Pick, PicksResult, ReadyEntry } from "./types";

export type ComputePicksInput = {
  candidates: CandidateInput[];
  inFlight: InFlightIssue[];
  /** Open issue numbers repo-wide — a blocked-by ref to a closed (merged) issue does not block. */
  openIssues: Set<number>;
  cap: number;
};

/**
 * Compute the parallel-safe next picks for an epic (skill Step 4):
 * 1. Drop blocked candidates (waiting on at least one OPEN issue).
 * 2. Drop in-flight candidates (open PR / worktree / herdr agent / assignee).
 * 3. Of the rest, greedily build a parallel set up to `cap`, starting with the
 *    issue that unblocks the most others, refusing any pair that shares files
 *    (including shared-infra overlap). Hard refuse — never relax.
 */
export function computeNextPicks(input: ComputePicksInput): PicksResult {
  const { candidates, cap } = input;
  const inFlightMap = new Map(input.inFlight.map((f) => [f.number, f.reason]));

  const blocked: BlockedEntry[] = [];
  const inFlight: InFlightIssue[] = [];
  const readyInputs: CandidateInput[] = [];

  for (const candidate of candidates) {
    const waitsOn = candidate.blockedBy.filter((n) => input.openIssues.has(n));
    if (waitsOn.length > 0) {
      blocked.push({ number: candidate.number, title: candidate.title, waitsOn });
      continue;
    }
    const reason = inFlightMap.get(candidate.number);
    if (reason !== undefined) {
      inFlight.push({ number: candidate.number, reason });
      continue;
    }
    readyInputs.push(candidate);
  }

  // Fan-out: how many blocked candidates each ready candidate would unblock.
  const unblocksByIssue = new Map<number, number[]>();
  for (const ready of readyInputs) {
    const unblocks = blocked
      .filter((b) => b.waitsOn.includes(ready.number))
      .map((b) => b.number);
    unblocksByIssue.set(ready.number, unblocks);
  }

  const ordered = [...readyInputs].sort((a, b) => {
    const fanOutDiff =
      (unblocksByIssue.get(b.number)?.length ?? 0) - (unblocksByIssue.get(a.number)?.length ?? 0);
    if (fanOutDiff !== 0) {
      return fanOutDiff;
    }
    return a.number - b.number;
  });

  const picks: Pick[] = [];
  const pickedFiles: string[] = [];
  const pickedIssues = new Set<number>();

  for (const candidate of ordered) {
    if (picks.length >= cap) {
      break;
    }
    if (pickedIssues.has(candidate.number)) {
      continue;
    }
    if (pickedIssues.size > 0 && filesOverlap(pickedFiles, candidate.files)) {
      continue; // hard refuse — file overlap with an already-picked issue
    }
    pickedIssues.add(candidate.number);
    pickedFiles.push(...candidate.files);
    picks.push({
      number: candidate.number,
      title: candidate.title,
      files: candidate.files,
      unblocks: unblocksByIssue.get(candidate.number) ?? [],
      highRisk: isHighRisk(candidate.files),
      filesDetected: candidate.files.length > 0,
    });
  }

  const ready: ReadyEntry[] = ordered.map((c) => ({
    number: c.number,
    title: c.title,
    highRisk: isHighRisk(c.files),
    filesDetected: c.files.length > 0,
  }));

  return { blocked, inFlight, ready, picks };
}

/**
 * Two file sets overlap when they share a literal file OR both touch the same
 * shared-infra glob (e.g. two different tsconfig.json edits, or two files under
 * packages/types/**).
 */
export function filesOverlap(a: string[], b: string[]): boolean {
  const setB = new Set(b);
  if (a.some((f) => setB.has(f))) {
    return true;
  }
  for (const glob of SHARED_INFRA_GLOBS) {
    if (a.some((f) => matchesGlob(glob, f)) && b.some((f) => matchesGlob(glob, f))) {
      return true;
    }
  }
  return false;
}

/** Which shared-infra globs a file set touches — used for report annotations. */
export function sharedInfraMatches(files: string[]): string[] {
  return SHARED_INFRA_GLOBS.filter((glob) => files.some((f) => matchesGlob(glob, f)));
}

/** High-risk picks touch schema/db/types infra → recommend --gate (stop before PR). */
export function isHighRisk(files: string[]): boolean {
  return HIGH_RISK_GLOBS.some((glob) => files.some((f) => matchesGlob(glob, f)));
}