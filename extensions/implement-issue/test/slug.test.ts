import { describe, expect, it } from "vitest";

import { slugIssueTitle } from "../src/slug";

describe("slugIssueTitle", () => {
  it("lowercases and replaces non-alphanumeric characters with hyphens", () => {
    expect(slugIssueTitle("Fix Search Ranking")).toBe("fix-search-ranking");
  });

  it("strips leading and trailing hyphens", () => {
    expect(slugIssueTitle("  Fix Search Ranking  ")).toBe("fix-search-ranking");
  });

  it("collapses repeated hyphens", () => {
    expect(slugIssueTitle("Fix--Search---Ranking")).toBe("fix-search-ranking");
  });

  it("falls back to untitled when no slug characters remain", () => {
    expect(slugIssueTitle("!!!???")).toBe("untitled");
  });
});
