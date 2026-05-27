export type PageGroupRuleLike = {
  name?: string;
  matchType: string;
  pattern: string;
  groupName: string;
  priority?: number;
};

export type NormalizePageInput = {
  pageUrl?: string | null;
  pageHostname?: string | null;
  pagePath?: string | null;
  pageTitle?: string | null;
  referrer?: string | null;
};

export type NormalizedPageData = {
  normalizedPageUrl: string | null;
  normalizedPageHostname: string | null;
  normalizedPagePath: string | null;
  pageGroup: string;
  pageGroupSource: string;
  pageSlug: string | null;
  pageTitle: string | null;
};

const FALLBACK_RULES: PageGroupRuleLike[] = [
  { matchType: 'path_prefix', pattern: '/services', groupName: 'Services', priority: 10 },
  { matchType: 'path_prefix', pattern: '/products', groupName: 'Products', priority: 20 },
  { matchType: 'path_prefix', pattern: '/solutions', groupName: 'Solutions', priority: 30 },
  { matchType: 'path_prefix', pattern: '/blog', groupName: 'Blog', priority: 40 },
  { matchType: 'path_prefix', pattern: '/case-studies', groupName: 'Case Studies', priority: 50 },
  { matchType: 'path_prefix', pattern: '/contact', groupName: 'Contact', priority: 60 },
  { matchType: 'path_prefix', pattern: '/careers', groupName: 'Careers', priority: 70 },
  { matchType: 'path_prefix', pattern: '/about', groupName: 'About', priority: 80 },
];

function valueOrNull(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseUrl(value?: string | null): URL | null {
  const trimmed = valueOrNull(value);

  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed);
  } catch {
    return null;
  }
}

function normalizePath(value?: string | null): string | null {
  const trimmed = valueOrNull(value);

  if (!trimmed) {
    return null;
  }

  const withoutQuery = trimmed.split('#')[0]?.split('?')[0] || '';
  const withLeadingSlash = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  const collapsed = withLeadingSlash.replace(/\/{2,}/g, '/');

  if (!collapsed || collapsed === '/') {
    return '/';
  }

  return collapsed.endsWith('/') ? collapsed : `${collapsed}/`;
}

export function extractPathFromUrl(url?: string | null): string | null {
  const parsed = parseUrl(url);
  return parsed ? normalizePath(parsed.pathname) : null;
}

export function extractHostnameFromUrl(url?: string | null): string | null {
  const parsed = parseUrl(url);
  return parsed?.hostname.toLowerCase() || null;
}

function normalizeUrl(url?: string | null): string | null {
  const parsed = parseUrl(url);

  if (!parsed) {
    return null;
  }

  parsed.hash = '';
  parsed.search = '';
  parsed.pathname = normalizePath(parsed.pathname) || '/';
  return parsed.toString();
}

export function createPageSlug(path?: string | null): string | null {
  const normalized = normalizePath(path);

  if (!normalized) {
    return null;
  }

  if (normalized === '/') {
    return 'home';
  }

  const slug = normalized
    .replace(/^\/|\/$/g, '')
    .split('/')
    .filter(Boolean)
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');

  return slug || null;
}

export function fallbackResolvePageGroup(path?: string | null): { groupName: string; source: string } {
  const normalized = normalizePath(path);

  if (!normalized) {
    return { groupName: 'Unknown', source: 'fallback:missing_path' };
  }

  if (normalized === '/') {
    return { groupName: 'Home', source: 'fallback:root' };
  }

  const match = FALLBACK_RULES.find((rule) => normalized.startsWith(rule.pattern));

  if (match) {
    return { groupName: match.groupName, source: `fallback:${match.matchType}:${match.pattern}` };
  }

  return { groupName: 'Other', source: 'fallback:other' };
}

export function resolvePageGroup(
  path?: string | null,
  rules: PageGroupRuleLike[] = [],
  hostname?: string | null,
): { groupName: string; source: string } {
  const normalized = normalizePath(path);

  if (!normalized) {
    return { groupName: 'Unknown', source: 'missing_path' };
  }

  if (normalized === '/') {
    return { groupName: 'Home', source: 'root_path' };
  }

  const sortedRules = [...rules].sort((left, right) => (left.priority || 100) - (right.priority || 100));

  for (const rule of sortedRules) {
    if (matchesRule(rule, normalized, hostname)) {
      return { groupName: rule.groupName, source: `rule:${rule.matchType}:${rule.pattern}` };
    }
  }

  return fallbackResolvePageGroup(normalized);
}

export function normalizePageData(input: NormalizePageInput, rules: PageGroupRuleLike[] = []): NormalizedPageData {
  const pageUrl = valueOrNull(input.pageUrl);
  const pagePath = normalizePath(input.pagePath);
  const referrer = valueOrNull(input.referrer);
  const pageUrlPath = extractPathFromUrl(pageUrl);
  const referrerPath = extractPathFromUrl(referrer);
  const normalizedPagePath = pageUrlPath || pagePath || referrerPath;
  const normalizedPageUrl = normalizeUrl(pageUrl) || (pageUrlPath ? null : normalizeUrl(referrer));
  const normalizedPageHostname =
    extractHostnameFromUrl(pageUrl) ||
    valueOrNull(input.pageHostname)?.toLowerCase() ||
    extractHostnameFromUrl(referrer);
  const pageGroup = resolvePageGroup(normalizedPagePath, rules, normalizedPageHostname);

  return {
    normalizedPageUrl,
    normalizedPageHostname,
    normalizedPagePath,
    pageGroup: pageGroup.groupName,
    pageGroupSource: pageGroup.source,
    pageSlug: createPageSlug(normalizedPagePath),
    pageTitle: valueOrNull(input.pageTitle),
  };
}

function matchesRule(rule: PageGroupRuleLike, path: string, hostname?: string | null): boolean {
  switch (rule.matchType) {
    case 'path_prefix':
      return path.startsWith(normalizePath(rule.pattern) || rule.pattern);
    case 'path_contains':
      return path.includes(rule.pattern);
    case 'hostname':
      return Boolean(hostname && hostname.toLowerCase() === rule.pattern.toLowerCase());
    case 'regex':
      try {
        return new RegExp(rule.pattern).test(path);
      } catch {
        return false;
      }
    default:
      return false;
  }
}
