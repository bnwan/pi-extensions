/**
 * Marker region rewritten on every epic-next run.
 * Everything outside these markers is a stable reference preserved verbatim.
 */
export const STATUS_MARKER_OPEN = "<!-- epic-next:status -->";
export const STATUS_MARKER_CLOSE = "<!-- /epic-next:status -->";

/** Default max concurrent agent panes. Raise only when the user asks. */
export const DEFAULT_CAP = 2;

/** herdr agent name prefix for spawned issue agents: imp-<issue-number>. */
export const AGENT_PREFIX = "imp-";

/** Timeout for `herdr agent start` (pi startup often exceeds the 30s default). */
export const AGENT_START_TIMEOUT_MS = 90_000;

/** Default base branch for issue worktrees. */
export const DEFAULT_BASE_BRANCH = "main";

/** Default limit for open-issue listing (matches the epic-next skill). */
export const OPEN_ISSUE_LIMIT = 200;

/**
 * Shared-infra globs: two picks matching the SAME glob overlap even when the
 * literal files differ (e.g. two different tsconfig.json edits) — parallel
 * spawn is refused for such pairs.
 */
export const SHARED_INFRA_GLOBS: readonly string[] = [
  "**/package.json",
  "**/bun.lock",
  "**/pnpm-lock.yaml",
  "**/yarn.lock",
  "**/tsconfig.json",
  "packages/types/**",
  "**/db.ts",
  "**/design-tokens.css",
  "**/schema*.ts",
  ".github/workflows/**",
];

/** Picks touching any of these are flagged high-risk → recommend --gate (stop before PR). */
export const HIGH_RISK_GLOBS: readonly string[] = [
  "packages/types/**",
  "**/db.ts",
  "**/design-tokens.css",
  "**/schema*.ts",
  "**/migrations/**",
];