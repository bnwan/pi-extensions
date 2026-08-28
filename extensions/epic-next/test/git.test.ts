import { describe, expect, it } from "vitest";

import {
  buildIssueBranch,
  buildIssueWorktreePath,
  issueFromBranch,
  issueFromWorktreePath,
  parseGitWorktreeList,
  parseOwnerRepo,
} from "../src/git";

describe("parseOwnerRepo", () => {
  it("parses ssh remotes", () => {
    expect(parseOwnerRepo("git@github.com:bnwan/markky.git")).toBe("bnwan/markky");
    expect(parseOwnerRepo("git@github.com:Nwaneampeh/markky.git")).toBe("Nwaneampeh/markky");
  });

  it("parses https remotes", () => {
    expect(parseOwnerRepo("https://github.com/bnwan/pi-extensions.git")).toBe("bnwan/pi-extensions");
    expect(parseOwnerRepo("https://github.com/bnwan/markky")).toBe("bnwan/markky");
  });

  it("parses ssh:// remotes", () => {
    expect(parseOwnerRepo("ssh://git@github.com/bnwan/markky.git")).toBe("bnwan/markky");
  });

  it("tolerates trailing slashes and rejects malformed urls", () => {
    expect(parseOwnerRepo("https://github.com/bnwan/markky/")).toBe("bnwan/markky");
    expect(parseOwnerRepo("git@github.com:markky")).toBeNull();
    expect(parseOwnerRepo("ssh://git@github.com/markky")).toBeNull();
    expect(parseOwnerRepo("")).toBeNull();
  });
});

describe("issueFromBranch / issueFromWorktreePath", () => {
  it("extracts issue numbers from epic-next branches", () => {
    expect(issueFromBranch("markky/issue-866")).toBe(866);
    expect(issueFromBranch("issue-866")).toBe(866);
  });

  it("extracts issue numbers from implement-issue branches with slugs", () => {
    expect(issueFromBranch("markky/issue-866-fix-search-worker")).toBe(866);
    expect(issueFromBranch("repo/issue-123-some-slug")).toBe(123);
  });

  it("returns null for non-issue branches", () => {
    expect(issueFromBranch("main")).toBeNull();
    expect(issueFromBranch("feature/foo")).toBeNull();
  });

  it("extracts issue numbers from worktree paths", () => {
    expect(issueFromWorktreePath("/Users/x/projects/markky-issue-866")).toBe(866);
    expect(issueFromWorktreePath("/Users/x/projects/markky-issue-866-fix-search")).toBe(866);
    expect(issueFromWorktreePath("/Users/x/projects/markky")).toBeNull();
  });
});

describe("issue branch and worktree naming", () => {
  it("builds the epic-next skill's names", () => {
    expect(buildIssueBranch("markky", 866)).toBe("markky/issue-866");
    expect(buildIssueWorktreePath("/Users/x/projects/markky", "markky", 866)).toBe(
      "/Users/x/projects/markky/../markky-issue-866",
    );
  });
});

describe("parseGitWorktreeList", () => {
  it("parses git worktree porcelain output", () => {
    const output = [
      "worktree /repo",
      "HEAD abcdef1234567890",
      "branch refs/heads/main",
      "",
      "worktree /repo-issue-866",
      "HEAD 1234567890abcdef",
      "branch refs/heads/markky/issue-866",
    ].join("\n");

    expect(parseGitWorktreeList(output)).toEqual([
      { path: "/repo", head: "abcdef1234567890", branch: "main", bare: false, detached: false },
      {
        path: "/repo-issue-866",
        head: "1234567890abcdef",
        branch: "markky/issue-866",
        bare: false,
        detached: false,
      },
    ]);
  });

  it("parses detached and bare worktrees", () => {
    const output = ["worktree /repo-bare", "HEAD deadbeef12345678", "bare"].join("\n");
    expect(parseGitWorktreeList(output)).toEqual([
      { path: "/repo-bare", head: "deadbeef12345678", branch: null, bare: true, detached: false },
    ]);
  });
});