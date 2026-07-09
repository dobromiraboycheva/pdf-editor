// Parse a human-authored page-range spec (e.g. "1-3, 5, 8-10") into 0-based
// page indices. Also preserves the original comma-separated grouping so
// Split's "outputs" mode can emit one PDF per fragment.
//
// All error messages are in English; the UI layer translates them.

export interface RangeResult {
  ok: boolean;
  /** Flattened, deduped, ascending 0-based indices. */
  indices?: number[];
  /** One array per comma-separated fragment, 0-based, in the input's order. */
  groups?: number[][];
  /** Human-readable error message, when `ok === false`. */
  error?: string;
}

/**
 * Parse a range specification. 1-based in, 0-based out.
 *
 * Grammar (whitespace-tolerant):
 *   spec     := fragment ("," fragment)*
 *   fragment := integer | integer "-" integer
 */
export function parsePageRanges(spec: string, pageCount: number): RangeResult {
  if (!Number.isInteger(pageCount) || pageCount < 0) {
    return { ok: false, error: 'Invalid page count.' };
  }

  const trimmed = spec.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: 'Page range is empty.' };
  }

  const fragments = trimmed.split(',');
  const groups: number[][] = [];
  const flat = new Set<number>();

  for (const rawFragment of fragments) {
    const fragment = rawFragment.trim();
    if (fragment.length === 0) {
      return { ok: false, error: 'Empty range fragment (stray comma).' };
    }

    // Split on hyphen; must be either "N" or "N-M".
    const parts = fragment.split('-').map((p) => p.trim());
    if (parts.length === 1) {
      const n = parseIndex(parts[0]);
      if (n === null) {
        return {
          ok: false,
          error: `"${fragment}" is not a valid page number.`,
        };
      }
      const check = validate(n, pageCount);
      if (check) return { ok: false, error: check };
      const zero = n - 1;
      groups.push([zero]);
      flat.add(zero);
    } else if (parts.length === 2) {
      const start = parseIndex(parts[0]);
      const end = parseIndex(parts[1]);
      if (start === null || end === null) {
        return {
          ok: false,
          error: `"${fragment}" is not a valid range.`,
        };
      }
      if (start > end) {
        return {
          ok: false,
          error: `Range "${fragment}" is reversed (start must be ≤ end).`,
        };
      }
      const startErr = validate(start, pageCount);
      if (startErr) return { ok: false, error: startErr };
      const endErr = validate(end, pageCount);
      if (endErr) return { ok: false, error: endErr };

      const group: number[] = [];
      for (let i = start; i <= end; i++) {
        const zero = i - 1;
        group.push(zero);
        flat.add(zero);
      }
      groups.push(group);
    } else {
      return {
        ok: false,
        error: `"${fragment}" has too many dashes.`,
      };
    }
  }

  const indices = Array.from(flat).sort((a, b) => a - b);
  return { ok: true, indices, groups };
}

function parseIndex(token: string): number | null {
  if (!/^\d+$/.test(token)) return null;
  const n = Number.parseInt(token, 10);
  if (!Number.isFinite(n)) return null;
  return n;
}

function validate(oneBased: number, pageCount: number): string | null {
  if (oneBased < 1) {
    return `Page ${oneBased} is out of range (pages start at 1).`;
  }
  if (oneBased > pageCount) {
    return `Page ${oneBased} is out of range (document has ${pageCount} pages).`;
  }
  return null;
}
