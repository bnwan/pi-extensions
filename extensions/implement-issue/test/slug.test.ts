import { describe, expect, it } from "vitest";

import { slugIssueTitle } from "../src/slug";

describe("slugIssueTitle", () => {
  it("falls back to untitled when no slug characters remain", () => {
    expect(slugIssueTitle("!!!???")).toBe("untitled");
  });
});
