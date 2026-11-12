export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  const s = String(total % 60).padStart(2, '0');
  const m = String(Math.floor((total / 60) % 60)).padStart(2, '0');
  const h = Math.floor(total / 3600);
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

export function formatExpiry(exp: string | null | undefined) {
  if (!exp) return 'No expiry date';
  const stamp = Number(exp);
  if (!Number.isFinite(stamp) || stamp <= 0) return 'No expiry date';
  const date = new Date(stamp * 1000);
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Channel names arrive decorated like "EN - Name" or "##### SPORTS #####". */
export function cleanName(name: string) {
  const trimmed = name
    .replace(/^[#*\s]+/, '')
    .replace(/[#*\s]+$/, '')
    .replace(/^[A-Z]{2,3}\s*[-|:]\s+(?=\S)/, '')
    .trim();
  return trimmed || name;
}

export function initials(name: string) {
  return name
    .replace(/[^a-z0-9 ]/gi, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase();
}

export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}
