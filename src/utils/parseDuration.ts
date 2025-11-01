export function parseDurationToSeconds(input: string | undefined): number | undefined {
  if (!input) return undefined;
  input = input.trim().toLowerCase();
  // Pure number: treat as seconds
  if (/^\d+$/.test(input)) return Number(input);

  // Support combined formats like '1h30m', or single like '10m', '2h', '1d', '45s'
  const regex = /(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/;
  const m = input.match(regex);
  if (!m) return undefined;

  const days = Number(m[1] || 0);
  const hours = Number(m[2] || 0);
  const mins = Number(m[3] || 0);
  const secs = Number(m[4] || 0);

  const total = days * 86400 + hours * 3600 + mins * 60 + secs;
  return total > 0 ? total : undefined;
}
