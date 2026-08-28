import { sharedInfraMatches } from "./picks";
import type { PicksResult } from "./types";

export type ReportInput = {
  epic: number;
  ownerRepo: string;
  syncedAt: string;
  cap: number;
  picks: PicksResult;
  notes: string[];
  commentUpdated: boolean;
  commentCreated: boolean;
  dryRun: boolean;
  commentBefore: number[];
};

export type ConflictPair = {
  a: number;
  b: number;
};

/** Build the concise user-facing report (skill Step 5). */
export function buildReport(input: ReportInput): string {
  const { picks } = input;
  const lines: string[] = [];

  lines.push(`EPIC #${input.epic} — epic-next (synced ${input.syncedAt}, ${input.ownerRepo})`);
  lines.push(
    picks.inFlight.length > 0
      ? `IN_FLIGHT: ${picks.inFlight.map((f) => `#${f.number} (${f.reason})`).join(", ")}`
      : "IN_FLIGHT: (none)",
  );
  lines.push(
    picks.blocked.length > 0
      ? `BLOCKED:   ${picks.blocked
          .map((b) => `#${b.number} (waits ${b.waitsOn.map((w) => `#${w}`).join(", ")})`)
          .join(", ")}`
      : "BLOCKED:   (none)",
  );
  lines.push(
    picks.ready.length > 0
      ? `READY:     ${picks.ready.map((r) => `#${r.number}`).join(", ")}`
      : "READY:     (none)",
  );

  if (picks.picks.length === 0) {
    lines.push(
      `NEXT UP (parallel-safe, cap=${input.cap}): (none) — nothing safe to spawn right now`,
    );
  } else {
    lines.push(
      `NEXT UP (parallel-safe, cap=${input.cap}): ${picks.picks
        .map((p) => `#${p.number} ${p.title}`)
        .join("  +  ")}`,
    );
    for (const pick of picks.picks) {
      if (pick.unblocks.length > 0) {
        lines.push(`  #${pick.number} — unblocks ${pick.unblocks.map((n) => `#${n}`).join(", ")}`);
      }
      if (pick.highRisk) {
        const globs = sharedInfraMatches(pick.files).join(", ");
        lines.push(
          `  #${pick.number} — HIGH-RISK${globs ? ` (${globs})` : ""} — recommend --gate (stop before PR)`,
        );
      }
      if (!pick.filesDetected) {
        lines.push(
          `  #${pick.number} — no files detected in body — verify scope before spawning`,
        );
      }
    }
  }

  if (input.dryRun) {
    lines.push("PLAN COMMENT: not updated (dry run)");
  } else if (input.commentCreated) {
    lines.push("PLAN COMMENT: created (status block + stable reference)");
  } else if (input.commentUpdated) {
    const before =
      input.commentBefore.length > 0
        ? input.commentBefore.map((n) => `#${n}`).join(" + ")
        : "(none)";
    const after =
      picks.picks.length > 0 ? picks.picks.map((p) => `#${p.number}`).join(" + ") : "(none)";
    lines.push(`PLAN COMMENT: updated (NEXT UP: ${after}, was ${before})`);
  }

  for (const note of input.notes) {
    lines.push(`NOTE: ${note}`);
  }

  return lines.join("\n");
}

/**
 * Stable reference section for a first-time plan comment: blocked chains and
 * parallel-conflict caveats derived from the current state. The status block
 * above it is refreshed every run; this section is a snapshot.
 */
export function buildStableReference(picks: PicksResult, conflicts: ConflictPair[]): string {
  const lines: string[] = ["## epic-next execution plan (stable reference)", ""];

  if (picks.blocked.length > 0) {
    lines.push("### Blocked chains");
    for (const b of picks.blocked) {
      lines.push(`- #${b.number} waits on ${b.waitsOn.map((w) => `#${w}`).join(", ")}`);
    }
    lines.push("");
  }

  if (conflicts.length > 0) {
    lines.push("### Parallel-safety caveats (never spawn these together)");
    for (const conflict of conflicts) {
      lines.push(`- #${conflict.a} and #${conflict.b} share files`);
    }
    lines.push("");
  }

  lines.push("Recomputed from live state on every epic-next run — do not hand-edit.");
  return lines.join("\n");
}