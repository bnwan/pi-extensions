import { describe, expect, it } from "vitest";

import { normalizeGitHubIssue } from "../src/github";

describe("normalizeGitHubIssue", () => {
  it("maps GitHub issue JSON into the internal issue shape", () => {
    expect(
      normalizeGitHubIssue({
        number: 123,
        title: "Fix search ranking",
        body: "Search results are ordered incorrectly.",
      }),
    ).toEqual({
      number: 123,
      title: "Fix search ranking",
      body: "Search results are ordered incorrectly.",
    });
  });

  it("normalizes blank issue bodies to null", () => {
    expect(
      normalizeGitHubIssue({
        number: 124,
        title: "Tidy docs",
        body: "   ",
      }),
    ).toEqual({
      number: 124,
      title: "Tidy docs",
      body: null,
    });
  });

  it("trims surrounding whitespace from issue titles", () => {
    expect(
      normalizeGitHubIssue({
        number: 125,
        title: "  Tidy docs  ",
        body: null,
      }),
    ).toEqual({
      number: 125,
      title: "Tidy docs",
      body: null,
    });
  });
});
