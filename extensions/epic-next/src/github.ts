import { OPEN_ISSUE_LIMIT } from "./constants";
import { expectArray, getPath, parseJsonValue } from "./json";
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
 * (one JSON value per line, possibly across pages). Invalid lines throw with
 * the offending snippet.
 */
export function parseNdjson(output: string, context: string): unknown[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseJsonValue(line, context));
}

export function listOpenPRs(cwd: string): OpenPR[] {
  const out = shellOrThrow(
    [
      "gh",
      "pr",
      "list",
      "--state",
      "open",
      "--limit",
      String(OPEN_ISSUE_LIMIT),
      "--json",
      "number,headRefName,title,assignees",
    ],
    cwd,
  );
  return expectArray(parseJsonValue(out, "gh pr list"), "gh pr list output").flatMap((raw) => {
    const number = getPath(raw, "number");
    const headRefName = getPath(raw, "headRefName");
    const title = getPath(raw, "title");
    if (typeof number !== "number" || typeof headRefName !== "string") {
      return [];
    }
    const assigneesRaw = getPath(raw, "assignees");
    const assignees = Array.isArray(assigneesRaw)
      ? assigneesRaw.flatMap((a) => {
          const login = getPath(a, "login");
          return typeof login === "string" ? [login] : [];
        })
      : [];
    return [{ number, headRefName, title: typeof title === "string" ? title : "", assignees }];
  });
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
  return expectArray(parseJsonValue(out, "gh issue list"), "gh issue list output").flatMap(
    (raw) => {
      const number = getPath(raw, "number");
      const title = getPath(raw, "title");
      if (typeof number !== "number" || typeof title !== "string") {
        return [];
      }
      const body = getPath(raw, "body");
      const state = getPath(raw, "state");
      const labelsRaw = getPath(raw, "labels");
      const labels = Array.isArray(labelsRaw)
        ? labelsRaw.flatMap((l) => {
            const name = getPath(l, "name");
            return typeof name === "string" ? [name] : [];
          })
        : [];
      const assigneesRaw = getPath(raw, "assignees");
      const assignees = Array.isArray(assigneesRaw)
        ? assigneesRaw.flatMap((a) => {
            const login = getPath(a, "login");
            return typeof login === "string" ? [login] : [];
          })
        : [];
      return [
        {
          number,
          title,
          body: typeof body === "string" ? body : null,
          state: typeof state === "string" ? state : "",
          labels,
          assignees,
        },
      ];
    },
  );
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
  return parseNdjson(out, "gh api comments").flatMap((raw) => {
    const id = getPath(raw, "id");
    const body = getPath(raw, "body");
    if (typeof id !== "number" || typeof body !== "string") {
      return [];
    }
    return [{ id, body }];
  });
}

/** The merged PR number for a branch, or null when there is none. */
export function findMergedPR(ownerRepo: string, branch: string, cwd: string): number | null {
  const out = shellOrThrow(
    [
      "gh",
      "pr",
      "list",
      "--state",
      "merged",
      "--head",
      branch,
      "--json",
      "number",
      "-R",
      ownerRepo,
    ],
    cwd,
  );
  const parsed = expectArray(parseJsonValue(out, "gh pr list --state merged"), "merged PR list");
  const number = getPath(parsed[0], "number");
  return typeof number === "number" ? number : null;
}

export function patchIssueComment(
  ownerRepo: string,
  commentId: number,
  body: string,
  cwd: string,
): void {
  shellOrThrow(
    [
      "gh",
      "api",
      "-X",
      "PATCH",
      `repos/${ownerRepo}/issues/comments/${commentId}`,
      "-f",
      `body=${body}`,
    ],
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