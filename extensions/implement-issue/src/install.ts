const INSTALL_COMMANDS = [
  { lockfile: "bun.lock", command: ["bun", "install"] },
  { lockfile: "bun.lockb", command: ["bun", "install"] },
  { lockfile: "pnpm-lock.yaml", command: ["pnpm", "install"] },
  { lockfile: "yarn.lock", command: ["yarn", "install"] },
  { lockfile: "package-lock.json", command: ["npm", "install"] },
] as const;

export function detectInstallCommand(files: string[]): string[] | null {
  const fileSet = new Set(files);

  for (const candidate of INSTALL_COMMANDS) {
    if (fileSet.has(candidate.lockfile)) {
      return [...candidate.command];
    }
  }

  return null;
}
