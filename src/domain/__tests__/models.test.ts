import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CURRENT_SCHEMA_VERSION,
  CURRENT_SETTINGS_SCHEMA_VERSION,
  migrateSettings,
  parseCandidate,
  parseDecision,
  parseVerdict,
  type Candidate,
  type Decision,
  type Verdict,
} from '../models.ts';

test('parseDecision validates valid decision records', () => {
  const valid: Decision = {
    id: 'dec-123',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    statement: 'Use PostgreSQL for persistent primary storage',
    rationale: 'Mature ecosystem, ACID compliance, and team familiarity.',
    status: 'active',
    owner: 'ari:cloud:jira:user-1',
    scope: {
      projectIds: ['ENG'],
      components: ['database'],
      labels: [],
      keywords: ['postgres'],
      codePaths: [],
    },
    source: {
      type: 'page',
      id: 'conf-456',
      url: 'https://example.atlassian.net/wiki/spaces/ENG/pages/456',
      quotedExcerpt: 'We agree to use PostgreSQL 16 for all new persistence.',
      contentHash: 'hash-abc',
    },
    confidence: 0.95,
    createdAt: '2026-01-01T00:00:00.000Z',
    confirmedBy: 'ari:cloud:jira:user-1',
    confirmedAt: '2026-01-01T00:00:00.000Z',
  };

  const parsed = parseDecision(valid);
  assert.ok(parsed);
  assert.equal(parsed.id, 'dec-123');
  assert.equal(parsed.status, 'active');
});

test('parseDecision rejects invalid decision status or missing fields', () => {
  const invalid = {
    id: 'dec-123',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    statement: 'Test',
    status: 'invalid_status', // Invalid
  };

  assert.equal(parseDecision(invalid), undefined);
  assert.equal(parseDecision(null), undefined);
  assert.equal(parseDecision('not an object'), undefined);
});

test('parseCandidate validates candidate status lifecycle', () => {
  const baseProposal = {
    statement: 'Deprecate v1 REST endpoints',
    rationale: 'v2 GraphQL is now standard.',
    owner: null,
    scope: {
      projectIds: [],
      components: [],
      labels: [],
      keywords: ['rest-v1'],
      codePaths: [],
    },
    source: {
      type: 'comment' as const,
      id: 'comm-789',
      url: 'https://example.atlassian.net/browse/ENG-101',
      quotedExcerpt: 'Let us deprecate v1 endpoints by Q3.',
      contentHash: 'hash-def',
    },
    confidence: 0.82,
  };

  const pendingCandidate: Candidate = {
    id: 'cand-1',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    proposal: baseProposal,
    status: 'pending',
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  const parsed = parseCandidate(pendingCandidate);
  assert.ok(parsed);
  assert.equal(parsed.status, 'pending');

  const confirmedCandidate: Candidate = {
    ...pendingCandidate,
    status: 'confirmed',
    reviewedBy: 'user-admin',
    reviewedAt: '2026-01-02T00:00:00.000Z',
  };

  assert.equal(parseCandidate(confirmedCandidate)?.status, 'confirmed');
});

test('parseVerdict validates conflict verdict outcomes', () => {
  const verdict: Verdict = {
    id: 'verdict-1',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    issueKey: 'ENG-204',
    decisionId: 'dec-123',
    verdict: 'conflict',
    confidence: 0.88,
    explanation: 'Issue proposes MongoDB which contradicts PostgreSQL mandate.',
    triggeringPhrases: ['using MongoDB for persistence'],
    issueContentHash: 'issue-hash-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    modelVersion: 'gpt-4o',
  };

  const parsed = parseVerdict(verdict);
  assert.ok(parsed);
  assert.equal(parsed.verdict, 'conflict');
  assert.deepEqual(parsed.triggeringPhrases, ['using MongoDB for persistence']);
});

test('migrateSettings migrates legacy setup storage correctly', () => {
  const legacy = {
    schemaVersion: 1,
    includedProjectIds: ['PROJ-1', 'PROJ-2'],
    includedSpaceIds: ['SPACE-1'],
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const migrated = migrateSettings(legacy);
  assert.ok(migrated);
  assert.equal(migrated.schemaVersion, CURRENT_SETTINGS_SCHEMA_VERSION);
  assert.deepEqual(migrated.includedProjectIds, ['PROJ-1', 'PROJ-2']);
  assert.deepEqual(migrated.includedSpaceIds, ['SPACE-1']);
  assert.equal(migrated.confidenceThreshold, 0.8);
  assert.equal(migrated.possibleConflictThreshold, 0.55);
});
