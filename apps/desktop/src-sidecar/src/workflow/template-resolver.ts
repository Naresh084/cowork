// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

const TEMPLATE_RE = /\{\{\s*([a-zA-Z0-9_.\[\]]+)\s*\}\}/g;

export function getPathValue(source: Record<string, unknown>, path: string): unknown {
  const normalized = path.replace(/\[(\d+)\]/g, '.$1');
  return normalized.split('.').filter(Boolean).reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, source);
}

export function resolveTemplateString(
  template: string,
  context: Record<string, unknown>,
): { value: string; missingPaths: string[] } {
  const missingPaths = new Set<string>();

  const value = template.replace(TEMPLATE_RE, (_match, rawPath: string) => {
    const resolved = getPathValue(context, rawPath);
    if (resolved === undefined || resolved === null) {
      missingPaths.add(rawPath);
      return '';
    }
    if (typeof resolved === 'string') return resolved;
    return JSON.stringify(resolved);
  });

  return {
    value,
    missingPaths: Array.from(missingPaths),
  };
}

export function resolveTemplateValue<T = unknown>(
  value: T,
  context: Record<string, unknown>,
): { value: T; missingPaths: string[] } {
  if (typeof value === 'string') {
    const resolved = resolveTemplateString(value, context);
    return {
      value: resolved.value as T,
      missingPaths: resolved.missingPaths,
    };
  }

  if (Array.isArray(value)) {
    const missing: string[] = [];
    const resolvedArray = value.map((item) => {
      const resolved = resolveTemplateValue(item, context);
      missing.push(...resolved.missingPaths);
      return resolved.value;
    });
    return {
      value: resolvedArray as T,
      missingPaths: missing,
    };
  }

  if (value && typeof value === 'object') {
    const missing: string[] = [];
    const next: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      const resolved = resolveTemplateValue(raw, context);
      missing.push(...resolved.missingPaths);
      next[key] = resolved.value;
    }
    return {
      value: next as T,
      missingPaths: missing,
    };
  }

  return {
    value,
    missingPaths: [],
  };
}
