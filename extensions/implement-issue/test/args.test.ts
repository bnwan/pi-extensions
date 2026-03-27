import { describe, expect, it } from "vitest";

import { parseImplementIssueArgs } from "../src/args";

describe("parseImplementIssueArgs", () => {
  it("parses an issue number with no flags", () => {
    expect(parseImplementIssueArgs("123")).toEqual({
      issueNumber: 123,
      yes: false,
      resume: false,
      noWorktree: false,
      noInstall: false,
      planOnly: false,
    });
  });

  it("parses flags in mixed order", () => {
    expect(parseImplementIssueArgs("--resume 456 --plan-only --yes")).toEqual({
      issueNumber: 456,
      yes: true,
      resume: true,
      noWorktree: false,
      noInstall: false,
      planOnly: true,
    });
  });

  it("rejects invalid issue numbers", () => {
    expect(() => parseImplementIssueArgs("abc")).toThrow("Issue number must be a positive integer");
  });

  it("rejects unknown flags", () => {
    expect(() => parseImplementIssueArgs("123 --wat")).toThrow("Unknown flag: --wat");
  });

  it("rejects single-dash flags with a clear error", () => {
    expect(() => parseImplementIssueArgs("123 -y")).toThrow("Unknown flag: -y");
  });

  it("rejects missing issue numbers", () => {
    expect(() => parseImplementIssueArgs("--yes")).toThrow("Issue number is required");
  });

  it("rejects duplicate issue numbers", () => {
    expect(() => parseImplementIssueArgs("123 456")).toThrow("Issue number must be provided only once");
  });
});
