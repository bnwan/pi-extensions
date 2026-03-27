import { spawnSync } from "node:child_process";

export type ShellResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export function shell(cmd: string[], cwd?: string): ShellResult {
  const result = spawnSync(cmd[0], cmd.slice(1), {
    cwd,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });

  return {
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
    exitCode: result.status ?? 1,
  };
}

export function shellOrThrow(cmd: string[], cwd?: string): string {
  const result = shell(cmd, cwd);
  if (result.exitCode !== 0) {
    throw new Error(`Command failed: ${cmd.join(" ")}\n${result.stderr}`);
  }
  return result.stdout;
}
