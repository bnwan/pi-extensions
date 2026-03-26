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
});
