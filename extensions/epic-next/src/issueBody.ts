/**
 * First-pass extraction of structured data from free-form GitHub issue bodies.
 *
 * These extractors only capture the unambiguous, regexable parts (explicit
 * blocked-by lines, umbrella/parent references, path-like tokens). The
 * orchestrator LLM reviews what was extracted and can pass `extra_files` /
 * `extra_blocked_by` to `epic_next_picks` when prose indicates scope or
 * ordering the extraction missed.
 */

/** Line-leading keywords that mark an issue as waiting on other issues. */
const BLOCKED_BY_LINE_RE =
  /^\s*(?:[-*•]\s*)?(?:\*\*)?\s*(?:blocked\s+by|after|depends?\s+on|dependenc(?:y|ies))\b(?=\s*[:#])/i;

/** Line-leading keywords that mark container (umbrella/parent) references. */
const ANCESTRY_LINE_RE = /^\s*(?:[-*•]\s*)?(?:\*\*)?\s*(?:umbrella|parent)\b(?=\s*[:#])/i;

const REF_RE = /#(\d+)/g;

/** Path characters allowed per segment (includes `*` for glob mentions like `packages/types/**`). */
const PATH_TOKEN_RE = /(?:^|[^\w.@-])([\w.@-]+(?:\/[\w.*@-]+)+)/gm;

/** Repo top-level dirs that mark an unquoted token as a real path. */
const PATH_ROOTS = new Set([
  "apps",
  "packages",
  "docs",
  "scripts",
  "script",
  "test",
  "tests",
  "e2e",
  "examples",
  "config",
  "migrations",
  "public",
  "src",
  ".github",
  ".pi",
]);

const BACKTICK_RE = /`([^`\n]+)`/g;

const FILE_EXTENSION_RE = /\.(ts|tsx|js|jsx|mjs|cjs|css|json|md|sql|html|ya?ml|toml|sh)$/i;

function refsOnMatchingLines(body: string | null, lineRe: RegExp): number[] {
  if (!body) {
    return [];
  }
  const refs = new Set<number>();
  for (const line of body.split("\n")) {
    if (!lineRe.test(line)) {
      continue;
    }
    for (const match of line.matchAll(REF_RE)) {
      refs.add(Number(match[1]));
    }
  }
  return [...refs].sort((a, b) => a - b);
}

/**
 * Extract explicit blocked-by references: lines like `Blocked by #875`,
 * `After #875`, `Depends on #875`, `Dependencies: After #875`.
 * Parent/umbrella container references are NOT included (see extractAncestry).
 */
export function extractBlockedBy(body: string | null): number[] {
  return refsOnMatchingLines(body, BLOCKED_BY_LINE_RE);
}

/**
 * Extract container references: lines like `Umbrella: #823` or `Parent: #903`.
 */
export function extractAncestry(body: string | null): number[] {
  return refsOnMatchingLines(body, ANCESTRY_LINE_RE);
}

/**
 * Extract path-like file references from an issue body — backtick-quoted spans
 * that look like paths, plus unquoted tokens rooted at a path separator.
 * Best effort only; the orchestrator passes extra_files for prose scope.
 */
export function extractFilePaths(body: string | null): string[] {
  if (!body) {
    return [];
  }
  const found = new Set<string>();

  for (const match of body.matchAll(BACKTICK_RE)) {
    addIfPathLike(match[1], found, "quoted");
  }
  for (const match of body.matchAll(PATH_TOKEN_RE)) {
    addIfPathLike(match[1], found, "unquoted");
  }

  return [...found];
}

function addIfPathLike(token: string, found: Set<string>, mode: "quoted" | "unquoted"): void {
  let candidate = token.trim();
  if (!candidate) {
    return;
  }
  // Skip URLs, CSS-ish tokens, branch refs with spaces, and anything with interior spaces.
  if (candidate.includes(":") || candidate.includes("://") || /[\s(),;=%…]/.test(candidate)) {
    return;
  }
  if (candidate.startsWith("./")) {
    candidate = candidate.slice(2);
  }
  if (candidate.startsWith("/") || candidate.startsWith("#")) {
    return;
  }
  const hasExtension = FILE_EXTENSION_RE.test(candidate);
  if (mode === "unquoted") {
    // Unquoted tokens are noisy (prose, CSS classes) — require a known repo
    // path root or a file extension before treating them as paths.
    const root = candidate.split("/")[0];
    if (!PATH_ROOTS.has(root) && !hasExtension) {
      return;
    }
  }
  const looksLikePath = candidate.includes("/") || hasExtension;
  if (!looksLikePath) {
    return;
  }
  found.add(candidate);
}