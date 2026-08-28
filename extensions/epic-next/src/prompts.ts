/**
 * The prompt fired at each spawned agent (skill Step 6). The spawned agent
 * follows the implementer skill end-to-end; the default prompt has it open the
 * PR itself, the gate prompt (high-risk picks) stops before PR creation for a
 * manual human review.
 */
export function buildSpawnPrompt(options: { issue: number; worktree: string; gate: boolean }): string {
  const { issue, worktree, gate } = options;
  if (gate) {
    return [
      `You are already in your issue worktree at ${worktree} (do NOT create another).`,
      `Load and follow the implementer skill (/skill:implementer ${issue}) up to push — but STOP before PR creation;`,
      "this is a high-risk (--gate) pick, the orchestrator surfaces the branch for a manual pre-PR human review first.",
      "Reply with: the branch name, `git diff --stat main..HEAD`, the tests you ran + results, your self-review verdict, and any blockers.",
    ].join(" ");
  }
  return [
    `You are already in your issue worktree at ${worktree} (do NOT create another).`,
    `Load and follow the implementer skill (/skill:implementer ${issue}) end-to-end through PR creation — you open the PR yourself (linking #${issue}).`,
    "Then reply with: the PR URL, the branch name, `git diff --stat main..HEAD`, the tests you ran + results, your self-review verdict, and any blockers.",
    "Stay alive and drive the post-PR review cycle (implementer handles comments + visual verification) until the PR merges;",
    "do NOT merge — the orchestrator merges on the user's `merge` trigger.",
  ].join(" ");
}