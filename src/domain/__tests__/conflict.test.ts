import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeContentHash,
  computeIssueContentHash,
  PatternConflictJudge,
  resolveWithComply,
  resolveWithException,
  resolveWithSupersede,
  retrieveCandidateDecisions,
  type IssueInput,
} from '../conflict.ts';
import { getSampleDecisions } from '../sampleData.ts';
import { CURRENT_SCHEMA_VERSION, type Verdict } from '../models.ts';

const sampleDecisions = getSampleDecisions();
const judge = new PatternConflictJudge();

const mockVerdict: Verdict = {
  id: 'verdict_001',
  schemaVersion: CURRENT_SCHEMA_VERSION,
  issueKey: 'ENG-500',
  decisionId: sampleDecisions[0]?.id ?? 'dec_sample_postgres',
  verdict: 'conflict',
  confidence: 0.94,
  explanation: 'Issue proposes MongoDB which contradicts PostgreSQL mandate.',
  triggeringPhrases: ['proposing MongoDB'],
  issueContentHash: 'hash_test_123',
  createdAt: '2026-03-01T10:00:00.000Z',
  modelVersion: 'pattern-v1',
};

test('computeIssueContentHash computes deterministic hash', () => {
  const issue: IssueInput = {
    key: 'ENG-101',
    summary: 'Add user profile service',
    description: 'Service storing user avatars and metadata.',
  };

  const hash1 = computeIssueContentHash(issue);
  const hash2 = computeIssueContentHash(issue);
  assert.equal(hash1, hash2);
  assert.match(hash1, /^hash_[0-9a-f]+$/);

  const modifiedHash = computeIssueContentHash({
    ...issue,
    description: 'Different description.',
  });
  assert.notEqual(hash1, modifiedHash);
});

test('retrieveCandidateDecisions ranks in-scope decisions by relevance', () => {
  const issue: IssueInput = {
    key: 'ENG-202',
    summary: 'Implement persistence for order management',
    description: 'We need to set up a relational database for orders.',
    components: ['database'],
    labels: ['db'],
  };

  const candidates = retrieveCandidateDecisions(sampleDecisions, issue, 3);
  assert.ok(candidates.length > 0);
  // Postgres decision should be top-ranked due to database component and db label
  assert.equal(candidates[0]?.id, 'dec_sample_postgres');
});

test('PatternConflictJudge detects direct database mandate contradiction', async () => {
  const postgresDecision = sampleDecisions.find((d) => d.id === 'dec_sample_postgres')!;
  const issue: IssueInput = {
    key: 'ENG-303',
    summary: 'Set up MongoDB for customer order documents',
    description: 'We are planning on proposing MongoDB as our main persistence store.',
  };

  const judgment = await judge.judge(postgresDecision, issue);
  assert.equal(judgment.verdict, 'conflict');
  assert.ok(judgment.confidence >= 0.9);
  assert.ok(judgment.triggeringPhrases.includes('proposing MongoDB'));
});

test('PatternConflictJudge detects cache as permanent store contradiction', async () => {
  const redisDecision = sampleDecisions.find((d) => d.id === 'dec_sample_redis_cache')!;
  const issue: IssueInput = {
    key: 'ENG-404',
    summary: 'Use Redis as persistent store for session balances',
    description: 'Store wallet balances in Redis as the permanent store without database fallback.',
  };

  const judgment = await judge.judge(redisDecision, issue);
  assert.equal(judgment.verdict, 'conflict');
  assert.ok(judgment.triggeringPhrases.length > 0);
});

test('PatternConflictJudge returns no_conflict for aligned issues', async () => {
  const postgresDecision = sampleDecisions.find((d) => d.id === 'dec_sample_postgres')!;
  const issue: IssueInput = {
    key: 'ENG-505',
    summary: 'Add index on PostgreSQL order_id column',
    description: 'Create a b-tree index on the orders table in our PostgreSQL 16 database.',
  };

  const judgment = await judge.judge(postgresDecision, issue);
  assert.equal(judgment.verdict, 'no_conflict');
});

test('resolveWithComply creates Comply resolution and audit log', () => {
  const { resolution, auditLog } = resolveWithComply(
    mockVerdict,
    'user-lead',
    'Adjusted ticket to use PostgreSQL 16 instead.',
    '2026-03-01T11:00:00.000Z',
  );

  assert.equal(resolution.action, 'comply');
  assert.equal(resolution.actor, 'user-lead');
  assert.equal(resolution.note, 'Adjusted ticket to use PostgreSQL 16 instead.');
  assert.equal(auditLog.action, 'comply_conflict');
});

test('resolveWithSupersede creates new decision, supersedes old, and links relation', () => {
  const oldDecision = sampleDecisions[0]!;
  const result = resolveWithSupersede(
    mockVerdict,
    oldDecision,
    'Permit MongoDB for unstructured telemetry event archives',
    'Unstructured time-series data requires schema-free document model.',
    'user-architect',
    '2026-03-01T12:00:00.000Z',
  );

  assert.equal(result.newDecision.status, 'active');
  assert.equal(result.supersededDecision.status, 'superseded');
  assert.equal(result.relation.type, 'supersedes');
  assert.equal(result.relation.fromId, result.newDecision.id);
  assert.equal(result.relation.toId, oldDecision.id);
  assert.equal(result.resolution.action, 'supersede');
  assert.equal(result.resolution.newDecisionId, result.newDecision.id);
});

test('resolveWithException records time-boxed exception with expiry', () => {
  const { resolution, auditLog } = resolveWithException(
    mockVerdict,
    'user-vp',
    'Temporary 90-day pilot for legacy third-party migration.',
    '2026-06-01T00:00:00.000Z',
    '2026-03-01T13:00:00.000Z',
  );

  assert.equal(resolution.action, 'exception');
  assert.equal(resolution.exceptionExpiry, '2026-06-01T00:00:00.000Z');
  assert.equal(auditLog.action, 'grant_exception');
});
