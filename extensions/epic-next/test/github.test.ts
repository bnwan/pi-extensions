import { describe, expect, it } from "vitest";

import { parseCrossRefNumbers, parseNdjson } from "../src/github";

describe("parseCrossRefNumbers", () => {
  it("parses one number per line across pages, dedupes and sorts", () => {
    const output = ["755", "754", "755", "", "745", "746"].join("\n");
    expect(parseCrossRefNumbers(output)).toEqual([745, 746, 754, 755]);
  });

  it("ignores junk lines", () => {
    expect(parseCrossRefNumbers("745\nnot-a-number\n0\n-3\n")).toEqual([745]);
  });
});

describe("parseNdjson", () => {
  it("parses one JSON object per line", () => {
    const output = ['{"id":1,"body":"a"}', '{"id":2,"body":"b"}'].join("\n");
    expect(parseNdjson<{ id: number; body: string }>(output)).toEqual([
      { id: 1, body: "a" },
      { id: 2, body: "b" },
    ]);
  });

  it("returns empty for empty output", () => {
    expect(parseNdjson("")).toEqual([]);
  });
});