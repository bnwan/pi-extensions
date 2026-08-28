import { describe, expect, it } from "vitest";

import { matchesGlob } from "../src/glob";

describe("matchesGlob", () => {
  it("matches ** prefixed patterns at any depth including root", () => {
    expect(matchesGlob("**/db.ts", "db.ts")).toBe(true);
    expect(matchesGlob("**/db.ts", "apps/app/src/lib/db/db.ts")).toBe(true);
    expect(matchesGlob("**/package.json", "package.json")).toBe(true);
    expect(matchesGlob("**/package.json", "apps/app/package.json")).toBe(true);
    expect(matchesGlob("**/tsconfig.json", "apps/app/tsconfig.json")).toBe(true);
  });

  it("matches directory-prefix ** patterns", () => {
    expect(matchesGlob("packages/types/**", "packages/types/a.ts")).toBe(true);
    expect(matchesGlob("packages/types/**", "packages/types/deep/nested/b.ts")).toBe(true);
    expect(matchesGlob(".github/workflows/**", ".github/workflows/ci.yml")).toBe(true);
    expect(matchesGlob("packages/types/**", "apps/app/src/types/a.ts")).toBe(false);
  });

  it("matches * within a segment", () => {
    expect(matchesGlob("**/schema*.ts", "schema.ts")).toBe(true);
    expect(matchesGlob("**/schema*.ts", "schema-bookmarks.ts")).toBe(true);
    expect(matchesGlob("**/schema*.ts", "apps/app/src/lib/db/schema-users.ts")).toBe(true);
    expect(matchesGlob("**/schema*.ts", "bookmarkSchema.ts")).toBe(false);
    expect(matchesGlob("**/schema*.ts", "schema-notes.tsx")).toBe(false);
  });

  it("requires full-path matches", () => {
    expect(matchesGlob("**/db.ts", "db.ts.bak")).toBe(false);
    expect(matchesGlob("**/db.ts", "src/db.tsx")).toBe(false);
    expect(matchesGlob("packages/types/**", "packages/typed/a.ts")).toBe(false);
  });

  it("does not let ** span nothing when a literal segment is required after it", () => {
    expect(matchesGlob("**/workflows/ci.yml", ".github/workflows/ci.yml")).toBe(true);
    expect(matchesGlob("a/**/b.ts", "a/b.ts")).toBe(true);
    expect(matchesGlob("a/**/b.ts", "a/x/y/b.ts")).toBe(true);
  });
});