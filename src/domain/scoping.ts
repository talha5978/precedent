import type { DecisionScope } from './models';

export type InitialScopeHints = {
  /** Jira project containing the source, when the source is a Jira comment. */
  sourceProjectId?: string;
  /** Projects referenced by linked issues or other reviewed source links. */
  linkedProjectIds?: string[];
  components?: string[];
  labels?: string[];
  keywords?: string[];
  codePaths?: string[];
};

export type IssueScopeContext = {
  projectIds: string[];
  components?: string[];
  labels?: string[];
  /** Summary, description, and recent comments concatenated by the caller. */
  searchableText?: string;
  codePaths?: string[];
};

function clean(value: string): string {
  return value.normalize('NFKC').trim();
}

function normalizeSet(values: readonly string[] | undefined, normalize: (value: string) => string): string[] {
  if (!values) return [];
  return [...new Set(values.map(clean).map(normalize).filter(Boolean))].sort();
}

function normalizeToken(value: string): string {
  return clean(value).toLocaleLowerCase('en-US');
}

function normalizePath(value: string): string {
  const path = clean(value).replace(/\\/g, '/');
  const absolute = path.startsWith('/');
  const segments: string[] = [];
  for (const segment of path.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..' && segments.length > 0 && segments.at(-1) !== '..') segments.pop();
    else if (segment !== '..') segments.push(segment);
  }
  return `${absolute ? '/' : ''}${segments.join('/')}`;
}

function containsKeyword(text: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, 'u').test(text);
}

/** Canonicalize scope before persistence or comparison; code paths remain case-sensitive. */
export function normalizeDecisionScope(scope: DecisionScope): DecisionScope {
  return {
    projectIds: normalizeSet(scope.projectIds, (value) => value),
    components: normalizeSet(scope.components, normalizeToken),
    labels: normalizeSet(scope.labels, normalizeToken),
    keywords: normalizeSet(scope.keywords, normalizeToken),
    codePaths: normalizeSet(scope.codePaths, normalizePath),
  };
}

/** Build editable defaults from source metadata; reviewers can replace any inferred values. */
export function inferInitialDecisionScope(hints: InitialScopeHints): DecisionScope {
  return normalizeDecisionScope({
    projectIds: [...(hints.sourceProjectId ? [hints.sourceProjectId] : []), ...(hints.linkedProjectIds ?? [])],
    components: hints.components ?? [],
    labels: hints.labels ?? [],
    keywords: hints.keywords ?? [],
    codePaths: hints.codePaths ?? [],
  });
}

export function isGlobalDecisionScope(scope: DecisionScope): boolean {
  const normalized = normalizeDecisionScope(scope);
  return Object.values(normalized).every((values) => values.length === 0);
}

function overlaps(constraints: readonly string[], actual: readonly string[]): boolean {
  if (constraints.length === 0) return true;
  const actualSet = new Set(actual);
  return constraints.some((value) => actualSet.has(value));
}

function pathOverlaps(constraints: readonly string[], actual: readonly string[]): boolean {
  if (constraints.length === 0) return true;
  return constraints.some((scopePath) =>
    actual.some((issuePath) => issuePath === scopePath || issuePath.startsWith(`${scopePath.replace(/\/$/, '')}/`)),
  );
}

/**
 * Empty dimensions impose no restriction. An entirely empty decision scope is global and matches
 * every issue. Populated dimensions are conjunctive; values within one dimension are alternatives.
 */
export function decisionMatchesIssue(scope: DecisionScope, issue: IssueScopeContext): boolean {
  const normalized = normalizeDecisionScope(scope);
  const components = normalizeSet(issue.components, normalizeToken);
  const labels = normalizeSet(issue.labels, normalizeToken);
  const issuePaths = normalizeSet(issue.codePaths, normalizePath);
  const text = normalizeToken(issue.searchableText ?? '');
  const hasKeywordMatch =
    normalized.keywords.length === 0 || normalized.keywords.some((keyword) => containsKeyword(text, keyword));

  return (
    overlaps(normalized.projectIds, normalizeSet(issue.projectIds, (value) => value)) &&
    overlaps(normalized.components, components) &&
    overlaps(normalized.labels, labels) &&
    hasKeywordMatch &&
    pathOverlaps(normalized.codePaths, issuePaths)
  );
}
