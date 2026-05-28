export function cleanCompanyName(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\s+/g, ' ');
}

export function namesLookSimilar(left?: string | null, right?: string | null): boolean {
  const leftName = normalizeName(left);
  const rightName = normalizeName(right);

  if (!leftName || !rightName) return false;

  return leftName.includes(rightName) || rightName.includes(leftName) || sharedTokenCount(leftName, rightName) >= 2;
}

function normalizeName(value?: string | null) {
  return (value || '')
    .toLowerCase()
    .replace(/\b(ltd|limited|inc|corp|corporation|llc|plc|pvt|private|company|co)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function sharedTokenCount(left: string, right: string) {
  const rightTokens = new Set(right.split(/\s+/).filter(Boolean));
  return left.split(/\s+/).filter((token) => rightTokens.has(token)).length;
}
