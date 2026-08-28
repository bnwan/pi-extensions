import { OPEN_ISSUE_LIMIT } from "./constants";
import { shell, shellOrThrow } from "./shell";
import type { OpenIssue, OpenPR } from "./types";

/**
 * Parse the cross-referenced issue numbers printed by
 * `gh api <timeline> --paginate -q '.[] | select(.event=="cross-referenced") | …'`
 * (one number per line, possibly across pages). Duplicates removed, sorted.
 */
export function parseCrossRefNumbers(output: string): number[] {
  const numbers = output
    .split("\n")
    .map((line) => Number(line.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  return [...new Set(numbers)].sort((a, b) => a - b);
}

/**
 * Parse NDJSON objects printed by `gh api <endpoint> --paginate -q '.[] | {…}'`
 * (one JSON object per line, possibly across pages).
 */
export function parseNdjson<T>(output: string): T[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

type RawAssignee = { login: string };
type RawLabel = { name: string };

export function listOpenPRs(cwd: string): OpenPR[] {
  const out = shellOrThrow(
    ["gh", "pr", "list", "--state", "open", "--json", "number,headRefName,title,assignees"],
    cwd,
  );
  type RawPR = {
    number: number;
    headRefName: string;
    title: string;
    assignees: RawAssignee[];
  };
  return (JSON.parse(out) as RawPR[]).map((pr) => ({
    number: pr.number,
    headRefName: pr.headRefName,
    title: pr.title,
    assignees: pr.assignees.map((a) => a.login),
  }));
}

export function listOpenIssues(cwd: string, limit = OPEN_ISSUE_LIMIT): OpenIssue[] {
  const out = shellOrThrow(
    [
      "gh",
      "issue",
      "list",
      "--state",
      "open",
      "--limit",
      String(limit),
      "--json",
      "number,title,body,state,labels,assignees",
    ],
    cwd,
  );
  type RawIssue = {
    number: number;
    title: string;
    body: string | null;
    state: string;
    labels: RawLabel[];
    assignees: RawAssignee[];
  };
  return (JSON.parse(out) as RawIssue[]).map((issue) => ({
    number: issue.number,
    title: issue.title,
    body: issue.body,
    state: issue.state,
    labels: issue.labels.map((l) => l.name),
    assignees: issue.assignees.map((a) => a.login),
  }));
}

/**
 * Issue numbers cross-referenced on an issue's timeline (children that mention
 * the issue — works for any epic without labels). PRs are filtered out.
 */
export function timelineCrossRefs(ownerRepo: string, issue: number, cwd: string): number[] {
  const out = shellOrThrow(
    [
      "gh",
      "api",
      `repos/${ownerRepo}/issues/${issue}/timeline`,
      "--paginate",
      "-q",
      '.[] | select(.event=="cross-referenced") | .source.issue | select(.pull_request == null) | .number',
    ],
    cwd,
  );
  return parseCrossRefNumbers(out);
}

export function listIssueComments(
  ownerRepo: string,
  issue: number,
  cwd: string,
): { id: number; body: string }[] {
  const out = shellOrThrow(
    [
      "gh",
      "api",
      `repos/${ownerRepo}/issues/${issue}/comments`,
      "--paginate",
      "-q",
      ".[] | {id: .id, body: .body}",
    ],
    cwd,
  );
  return parseNdjson<{ id: number; body: string }>(out);
}

export function patchIssueComment(
  ownerRepo: string,
  commentId: number,
  body: string,
  cwd: string,
): void {
  shellOrThrow(
    ["gh", "api", "-X", "PATCH", `repos/${ownerRepo}/issues/comments/${commentId}`, "-f", `body=${body}`],
    cwd,
  );
}

export function createIssueComment(ownerRepo: string, issue: number, body: string, cwd: string): void {
  shellOrThrow(
    ["gh", "api", `repos/${ownerRepo}/issues/${issue}/comments`, "-f", `body=${body}`],
    cwd,
  );
}

/** Whether an issue looks like an epic/umbrella container by its labels. */
export function isEpicLike(issue: OpenIssue): boolean {
  return issue.labels.some((label) => /epic/i.test(label));
}

/** Run `gh auth status`; returns a warning string when not authed, null otherwise. */
export function ghAuthWarning(): string | null {
  const result = shell(["gh", "auth", "status"]);
  return result.exitCode === 0 ? null : "gh is not authenticated — `gh auth login` first";
}