/**
 * Minimal glob matcher supporting:
 * - `**` as a whole segment: matches zero or more whole path segments
 * - `*` inside a segment: matches any characters except `/`
 *
 * Patterns must match the whole path (anchored at both ends).
 */
export function matchesGlob(pattern: string, path: string): boolean {
  return matchSegments(pattern.split("/"), path.split("/"));
}

function matchSegments(pattern: string[], segments: string[]): boolean {
  if (pattern.length === 0) {
    return segments.length === 0;
  }
  const [head, ...rest] = pattern;
  if (head === "**") {
    for (let skip = 0; skip <= segments.length; skip++) {
      if (matchSegments(rest, segments.slice(skip))) {
        return true;
      }
    }
    return false;
  }
  if (segments.length === 0) {
    return false;
  }
  return segmentMatches(head, segments[0]) && matchSegments(rest, segments.slice(1));
}

function segmentMatches(patternSegment: string, segment: string): boolean {
  const source = patternSegment.split("*").map(escapeRegex).join("[^/]*");
  return new RegExp(`^${source}$`).test(segment);
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}