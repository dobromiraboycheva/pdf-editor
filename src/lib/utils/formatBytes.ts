/**
 * Format a byte count as a human-readable string (e.g. "1.2 MB", "456 KB").
 * Uses binary (1024) units.
 */
export function formatBytes(bytes: number, fractionDigits = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;
  const exp = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / Math.pow(1024, exp);

  // Bytes don't need decimals.
  const digits = exp === 0 ? 0 : fractionDigits;
  return `${value.toFixed(digits)} ${units[exp]}`;
}
