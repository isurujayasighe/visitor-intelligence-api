export type UrlGroupRuleLike = {
  id: string;
  name?: string;
  pattern: string;
  groupName: string;
  priority?: number;
};

export type NormalizedUrl = {
  originalUrl: string | null;
  hostname: string | null;
  path: string | null;
};

export type GroupedUrl = NormalizedUrl & {
  groupName: string;
  groupRuleId: string | null;
};

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

export function removeQueryStringAndHash(path?: string | null): string | null {
  const trimmed = valueOrNull(path);

  if (!trimmed) {
    return null;
  }

  return trimmed.split('#')[0]?.split('?')[0] || null;
}

export function normalizeTrailingSlash(path?: string | null): string | null {
  const cleanPath = removeQueryStringAndHash(path);

  if (!cleanPath) {
    return null;
  }

  const withLeadingSlash = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;
  const collapsed = withLeadingSlash.replace(/\/{2,}/g, '/');

  if (collapsed === '/') {
    return '/';
  }

  return collapsed.endsWith('/') ? collapsed : `${collapsed}/`;
}

export function extractHostname(url?: string | null): string | null {
  return parseUrl(url)?.hostname.toLowerCase() || null;
}

export function extractPath(url?: string | null): string | null {
  const parsed = parseUrl(url);
  return parsed ? normalizeTrailingSlash(parsed.pathname) : null;
}

export function normalizeUrl(inputUrl?: string | null, inputPath?: string | null, fallbackUrl?: string | null): NormalizedUrl {
  const pageUrl = valueOrNull(inputUrl);
  const pagePath = normalizeTrailingSlash(inputPath);
  const referrer = valueOrNull(fallbackUrl);
  const parsedPageUrl = parseUrl(pageUrl);
  const parsedReferrer = parseUrl(referrer);

  if (parsedPageUrl) {
    return {
      originalUrl: pageUrl,
      hostname: parsedPageUrl.hostname.toLowerCase(),
      path: normalizeTrailingSlash(parsedPageUrl.pathname),
    };
  }

  if (pagePath) {
    return {
      originalUrl: pageUrl || null,
      hostname: null,
      path: pagePath,
    };
  }

  if (parsedReferrer) {
    return {
      originalUrl: referrer,
      hostname: parsedReferrer.hostname.toLowerCase(),
      path: normalizeTrailingSlash(parsedReferrer.pathname),
    };
  }

  return {
    originalUrl: pageUrl || referrer || null,
    hostname: null,
    path: null,
  };
}

export function groupUrlByRegex(path?: string | null, rules: UrlGroupRuleLike[] = []): { groupName: string; groupRuleId: string | null } {
  const normalizedPath = normalizeTrailingSlash(path);

  if (!normalizedPath) {
    return { groupName: 'Other pages', groupRuleId: null };
  }

  const sortedRules = [...rules].sort((left, right) => (left.priority || 100) - (right.priority || 100));

  for (const rule of sortedRules) {
    try {
      if (new RegExp(rule.pattern).test(normalizedPath)) {
        return { groupName: rule.groupName, groupRuleId: rule.id };
      }
    } catch {
      continue;
    }
  }

  return { groupName: 'Other pages', groupRuleId: null };
}

export function normalizeAndGroupUrl(
  input: { pageUrl?: string | null; pagePath?: string | null; referrer?: string | null },
  rules: UrlGroupRuleLike[] = [],
): GroupedUrl {
  const normalized = normalizeUrl(input.pageUrl, input.pagePath, input.referrer);
  const group = groupUrlByRegex(normalized.path, rules);

  return {
    ...normalized,
    groupName: group.groupName,
    groupRuleId: group.groupRuleId,
  };
}
