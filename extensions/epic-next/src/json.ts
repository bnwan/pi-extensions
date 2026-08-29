/**
 * IO-boundary JSON helpers: parse CLI output (gh, herdr) into `unknown` and
 * narrow it with explicit checks so shape drift produces a clear error
 * instead of a blind-cast TypeError.
 */

export function parseJsonValue(text: string, context: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Failed to parse ${context} output as JSON: ${text.slice(0, 200)}`);
  }
}

/** Narrow an unknown value to a plain record (JSON object). Null when not one. */
export function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const record: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    record[key] = entry;
  }
  return record;
}

export function expectString(value: unknown, context: string): string {
  if (typeof value !== "string") {
    throw new Error(`Expected ${context} to be a string, got: ${JSON.stringify(value)?.slice(0, 100)}`);
  }
  return value;
}

export function expectNumber(value: unknown, context: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Expected ${context} to be a number, got: ${JSON.stringify(value)?.slice(0, 100)}`);
  }
  return value;
}

export function expectArray(value: unknown, context: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Expected ${context} to be an array, got: ${String(value).slice(0, 100)}`);
  }
  return value;
}

/** Walk nested JSON object keys safely; undefined as soon as a level is missing. */
export function getPath(value: unknown, ...keys: string[]): unknown {
  let current: unknown = value;
  for (const key of keys) {
    const record = asRecord(current);
    if (record === null) {
      return undefined;
    }
    current = record[key];
  }
  return current;
}