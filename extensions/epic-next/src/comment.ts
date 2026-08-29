import { STATUS_MARKER_CLOSE, STATUS_MARKER_OPEN } from "./constants";
import type { BlockedEntry, InFlightIssue } from "./types";

export type PlanComment = {
  id: number;
  body: string;
};

/** The first VALID open→close marker pair, or null when there is none. */
function findMarkerPair(body: string): { openIdx: number; closeIdx: number } | null {
  const openIdx = body.indexOf(STATUS_MARKER_OPEN);
  if (openIdx === -1) {
    return null;
  }
  const closeIdx = body.indexOf(STATUS_MARKER_CLOSE, openIdx + STATUS_MARKER_OPEN.length);
  if (closeIdx === -1) {
    return null;
  }
  return { openIdx, closeIdx };
}

/** Whether the body carries a well-formed status region (ordered marker pair). */
export function hasValidStatusRegion(body: string): boolean {
  return findMarkerPair(body) !== null;
}

/**
 * Find the epic's living-plan comment: one with a VALID status region.
 * A comment that merely quotes a marker in prose (open marker without an
 * ordered close) is skipped. Among valid candidates, prefer one whose
 * region carries our `**Synced:**` signature (the marker pair could be
 * quoted in documentation inside a code fence).
 */
export function findPlanComment<T extends PlanComment>(comments: T[]): T | null {
  const valid = comments.filter((c) => hasValidStatusRegion(c.body));
  const authored = valid.find((c) => {
    const pair = findMarkerPair(c.body);
    return pair !== null && c.body.slice(pair.openIdx, pair.closeIdx).includes("**Synced:**");
  });
  return authored ?? valid[0] ?? null;
}

/**
 * Replace the status region (the first VALID marker pair, inclusive) with a
 * new status block. Everything outside the pair is preserved verbatim.
 * - No open marker at all → append at the end.
 * - Open marker without a close after it (unterminated region, e.g. someone
 *   hand-edited and broke the close marker) → replace from the open marker to
 *   the end of the body, which repairs the region without touching content
 *   before it.
 */
export function spliceStatusBlock(body: string, statusBlockWithMarkers: string): string {
  const pair = findMarkerPair(body);
  if (pair === null) {
    const openIdx = body.indexOf(STATUS_MARKER_OPEN);
    if (openIdx === -1) {
      const trimmed = body.replace(/\s+$/, "");
      return trimmed ? `${trimmed}\n\n${statusBlockWithMarkers}` : statusBlockWithMarkers;
    }
    // Unterminated region — replace from the open marker to the end.
    return body.slice(0, openIdx) + statusBlockWithMarkers;
  }
  const end = pair.closeIdx + STATUS_MARKER_CLOSE.length;
  return body.slice(0, pair.openIdx) + statusBlockWithMarkers + body.slice(end);
}

export type StatusBlockInput = {
  syncedAt: string;
  picks: number[];
  inFlight: InFlightIssue[];
  blocked: BlockedEntry[];
};

/**
 * Compose the status block (including markers):
 * `**Synced:** <iso> · **NEXT UP:** #N + #M (parallel-safe) · **In-flight:** … · **Blocked:** …`
 * Empty sections are omitted.
 */
export function buildStatusBlock(input: StatusBlockInput): string {
  const segments = [`**Synced:** ${input.syncedAt}`];
  if (input.picks.length > 0) {
    segments.push(`**NEXT UP:** ${input.picks.map((n) => `#${n}`).join(" + ")} (parallel-safe)`);
  }
  if (input.inFlight.length > 0) {
    segments.push(
      `**In-flight:** ${input.inFlight.map((f) => `#${f.number} (${f.reason})`).join(", ")}`,
    );
  }
  if (input.blocked.length > 0) {
    segments.push(
      `**Blocked:** ${input.blocked
        .map((b) => `#${b.number}→${b.waitsOn.map((w) => `#${w}`).join(", ")}`)
        .join(", ")}`,
    );
  }
  return [STATUS_MARKER_OPEN, segments.join(" · "), STATUS_MARKER_CLOSE].join("\n");
}

/** Parse the current NEXT UP issue numbers out of a plan-comment body. */
export function extractNextUp(body: string): number[] {
  const pair = findMarkerPair(body);
  const region = pair !== null ? body.slice(pair.openIdx, pair.closeIdx) : body;
  const match = region.match(/\*\*NEXT UP:\*\*\s*([^\n·]*)/);
  if (!match) {
    return [];
  }
  return [...match[1].matchAll(/#(\d+)/g)].map((m) => Number(m[1]));
}

/** The raw status-region text between the markers (may carry human directives). */
export function extractStatusRegion(body: string): string {
  const pair = findMarkerPair(body);
  if (pair === null) {
    return "";
  }
  return body.slice(pair.openIdx + STATUS_MARKER_OPEN.length, pair.closeIdx).trim();
}

/**
 * Whether a status region carries a human spawn directive (pause/hold).
 * Word-bounded so prose like "placeholder" or "threshold" does not match.
 */
export function carriesSpawnDirective(statusRegion: string): boolean {
  return /\bpause|\bhard stop\b|\bdo not spawn\b|\bhold\b/i.test(statusRegion);
}