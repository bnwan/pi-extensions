import { describe, expect, it } from "vitest";

import { detectInstallCommand } from "../src/install";

describe("detectInstallCommand", () => {
  it("detects bun from bun.lock", () => {
    expect(detectInstallCommand(["README.md", "bun.lock"])).toEqual(["bun", "install"]);
  });

  it("detects bun from bun.lockb", () => {
    expect(detectInstallCommand(["README.md", "bun.lockb"])).toEqual(["bun", "install"]);
  });

  it("detects pnpm from pnpm-lock.yaml", () => {
    expect(detectInstallCommand(["pnpm-lock.yaml", "package.json"])).toEqual(["pnpm", "install"]);
  });

  it("detects yarn from yarn.lock", () => {
    expect(detectInstallCommand(["yarn.lock", "package.json"])).toEqual(["yarn", "install"]);
  });

  it("detects npm from package-lock.json", () => {
    expect(detectInstallCommand(["package-lock.json", "package.json"])).toEqual(["npm", "install"]);
  });

  it("returns null when no supported lockfile exists", () => {
    expect(detectInstallCommand(["README.md", "Gemfile"])).toBeNull();
  });
});
