import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decisionMatchesIssue,
  inferInitialDecisionScope,
  isGlobalDecisionScope,
  normalizeDecisionScope,
} from '../scoping.ts';

test('normalizeDecisionScope canonicalizes and sorts tokens', () => {
  const scope = normalizeDecisionScope({
    projectIds: ['PROJ-2', 'PROJ-1', 'PROJ-2 '],
    components: [' Auth ', 'billing', 'AUTH'],
    labels: ['Security', 'security', 'api-v2'],
    keywords: [' postgres ', 'POSTGRES', 'kafka'],
    codePaths: ['src/services/../domain/models.ts', 'src//domain/models.ts', '/app/src/'],
  });

  assert.deepEqual(scope.projectIds, ['PROJ-1', 'PROJ-2']);
  assert.deepEqual(scope.components, ['auth', 'billing']);
  assert.deepEqual(scope.labels, ['api-v2', 'security']);
  assert.deepEqual(scope.keywords, ['kafka', 'postgres']);
  assert.deepEqual(scope.codePaths, ['/app/src', 'src/domain/models.ts']);
});

test('isGlobalDecisionScope identifies completely empty scopes', () => {
  assert.equal(
    isGlobalDecisionScope({
      projectIds: [],
      components: [],
      labels: [],
      keywords: [],
      codePaths: [],
    }),
    true,
  );

  assert.equal(
    isGlobalDecisionScope({
      projectIds: ['PROJ-1'],
      components: [],
      labels: [],
      keywords: [],
      codePaths: [],
    }),
    false,
  );
});

test('inferInitialDecisionScope builds default scope from source hints', () => {
  const scope = inferInitialDecisionScope({
    sourceProjectId: 'CORE',
    linkedProjectIds: ['PAY', 'CORE'],
    components: ['Checkout'],
    labels: ['compliance'],
    keywords: ['stripe'],
    codePaths: ['services/payment'],
  });

  assert.deepEqual(scope.projectIds, ['CORE', 'PAY']);
  assert.deepEqual(scope.components, ['checkout']);
  assert.deepEqual(scope.labels, ['compliance']);
  assert.deepEqual(scope.keywords, ['stripe']);
  assert.deepEqual(scope.codePaths, ['services/payment']);
});

test('decisionMatchesIssue matches global scopes against any issue', () => {
  const globalScope = {
    projectIds: [],
    components: [],
    labels: [],
    keywords: [],
    codePaths: [],
  };

  const matches = decisionMatchesIssue(globalScope, {
    projectIds: ['ANY-1'],
    components: ['frontend'],
    labels: ['ui'],
    searchableText: 'arbitrary issue content',
  });

  assert.equal(matches, true);
});

test('decisionMatchesIssue matches single dimension alternatives', () => {
  const scope = {
    projectIds: ['ENG', 'INFRA'],
    components: [],
    labels: [],
    keywords: [],
    codePaths: [],
  };

  assert.equal(decisionMatchesIssue(scope, { projectIds: ['ENG'] }), true);
  assert.equal(decisionMatchesIssue(scope, { projectIds: ['INFRA'] }), true);
  assert.equal(decisionMatchesIssue(scope, { projectIds: ['SALES'] }), false);
});

test('decisionMatchesIssue applies conjunctive restrictions across populated dimensions', () => {
  const scope = {
    projectIds: ['ENG'],
    components: ['auth'],
    labels: ['security'],
    keywords: [],
    codePaths: [],
  };

  // Matches all constraints
  assert.equal(
    decisionMatchesIssue(scope, {
      projectIds: ['ENG'],
      components: ['Auth', 'UI'],
      labels: ['SECURITY'],
    }),
    true,
  );

  // Missing required component
  assert.equal(
    decisionMatchesIssue(scope, {
      projectIds: ['ENG'],
      components: ['billing'],
      labels: ['security'],
    }),
    false,
  );

  // Missing required label
  assert.equal(
    decisionMatchesIssue(scope, {
      projectIds: ['ENG'],
      components: ['auth'],
      labels: ['performance'],
    }),
    false,
  );
});

test('decisionMatchesIssue checks keywords against issue searchable text', () => {
  const scope = {
    projectIds: [],
    components: [],
    labels: [],
    keywords: ['redis', 'memcached'],
    codePaths: [],
  };

  assert.equal(
    decisionMatchesIssue(scope, {
      projectIds: ['ANY'],
      searchableText: 'We should use Redis for session caching.',
    }),
    true,
  );

  assert.equal(
    decisionMatchesIssue(scope, {
      projectIds: ['ANY'],
      searchableText: 'We should use Postgres for caching.',
    }),
    false,
  );

  // Substring non-match: "predispose" shouldn't trigger "redis" keyword
  assert.equal(
    decisionMatchesIssue(scope, {
      projectIds: ['ANY'],
      searchableText: 'This will predispose us to errors.',
    }),
    false,
  );
});

test('decisionMatchesIssue checks code paths hierarchically', () => {
  const scope = {
    projectIds: [],
    components: [],
    labels: [],
    keywords: [],
    codePaths: ['src/services/billing'],
  };

  assert.equal(
    decisionMatchesIssue(scope, {
      projectIds: ['ANY'],
      codePaths: ['src/services/billing/stripe.ts'],
    }),
    true,
  );

  assert.equal(
    decisionMatchesIssue(scope, {
      projectIds: ['ANY'],
      codePaths: ['src/services/auth/oauth.ts'],
    }),
    false,
  );
});
