import { STATUS_MARKER_CLOSE, STATUS_MARKER_OPEN } from "./constants";
import type { BlockedEntry, InFlightIssue } from "./types";

export type PlanComment = {
  id: number;
  body: string;
};

/** Find the epic's living-plan comment: the one containing the status marker. */
export function findPlanComment<T extends PlanComment>(comments: T[]): T | null {
  return comments.find((c) => c.body.includes(STATUS_MARKER_OPEN)) ?? null;
}

/**
 * Replace the status region (between the markers, inclusive) with a new status
 * block. Everything outside the markers is preserved verbatim. If the markers
 * are missing or malformed, append the status block at the end instead.
 */
export function spliceStatusBlock(body: string, statusBlockWithMarkers: string): string {
  const openIdx = body.indexOf(STATUS_MARKER_OPEN);
  const closeIdx = body.indexOf(STATUS_MARKER_CLOSE);
  if (openIdx === -1 || closeIdx === -1 || closeIdx < openIdx) {
    const trimmed = body.replace(/\s+$/, "");
    return trimmed ? `${trimmed}\n\n${statusBlockWithMarkers}` : statusBlockWithMarkers;
  }
  const end = closeIdx + STATUS_MARKER_CLOSE.length;
  return body.slice(0, openIdx) + statusBlockWithMarkers + body.slice(end);
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
        .map((b) => `#${b.number}→${b.waitsOn.map((w) => `#${w}`).join(",")}`)
        .join(", ")}`,
    );
  }
  return [STATUS_MARKER_OPEN, segments.join(" · "), STATUS_MARKER_CLOSE].join("\n");
}

/** Parse the current NEXT UP issue numbers out of a plan-comment body. */
export function extractNextUp(body: string): number[] {
  const openIdx = body.indexOf(STATUS_MARKER_OPEN);
  const closeIdx = body.indexOf(STATUS_MARKER_CLOSE);
  const region = openIdx !== -1 && closeIdx > openIdx ? body.slice(openIdx, closeIdx) : body;
  const match = region.match(/\*\*NEXT UP:\*\*\s*([^\n·]*)/);
  if (!match) {
    return [];
  }
  return [...match[1].matchAll(/#(\d+)/g)].map((m) => Number(m[1]));
}

/** The raw status-region text between the markers (may carry human directives). */
export function extractStatusRegion(body: string): string {
  const openIdx = body.indexOf(STATUS_MARKER_OPEN);
  const closeIdx = body.indexOf(STATUS_MARKER_CLOSE);
  if (openIdx === -1 || closeIdx === -1 || closeIdx < openIdx) {
    return "";
  }
  return body.slice(openIdx + STATUS_MARKER_OPEN.length, closeIdx).trim();
}