import test from 'node:test';
import assert from 'node:assert/strict';
import {
  confirmCandidateProposal,
  filterCandidates,
  filterDecisions,
  rejectCandidateProposal,
} from '../decisions.ts';
import { CURRENT_SCHEMA_VERSION, type Candidate, type Decision } from '../models.ts';

const mockCandidate: Candidate = {
  id: 'cand-001',
  schemaVersion: CURRENT_SCHEMA_VERSION,
  proposal: {
    statement: 'Standardize on OpenTelemetry for backend tracing',
    rationale: 'Unified observability across all Node and Go microservices.',
    owner: 'ari:cloud:jira:user-99',
    scope: {
      projectIds: ['CORE', 'INFRA'],
      components: ['Observability'],
      labels: ['telemetry'],
      keywords: ['otel', 'tracing'],
      codePaths: ['src/telemetry'],
    },
    source: {
      type: 'page',
      id: 'page-123',
      url: 'https://acme.atlassian.net/wiki/spaces/ENG/pages/123',
      quotedExcerpt: 'Decision: We mandate OpenTelemetry across all backend services.',
      contentHash: 'hash-otel-123',
    },
    confidence: 0.92,
  },
  status: 'pending',
  createdAt: '2026-01-10T10:00:00.000Z',
};

test('confirmCandidateProposal creates valid Decision and updates Candidate', () => {
  const result = confirmCandidateProposal({
    candidate: mockCandidate,
    reviewerId: 'ari:cloud:jira:admin-1',
    now: '2026-01-11T12:00:00.000Z',
    decisionIdGenerator: () => 'dec-fixed-id',
  });

  assert.equal(result.decision.id, 'dec-fixed-id');
  assert.equal(result.decision.statement, mockCandidate.proposal.statement);
  assert.equal(result.decision.status, 'active');
  assert.equal(result.decision.confirmedBy, 'ari:cloud:jira:admin-1');
  assert.equal(result.decision.confirmedAt, '2026-01-11T12:00:00.000Z');
  assert.deepEqual(result.decision.scope.projectIds, ['CORE', 'INFRA']);
  assert.deepEqual(result.decision.scope.components, ['observability']); // normalized lower-case

  assert.equal(result.updatedCandidate.status, 'confirmed');
  assert.equal(result.updatedCandidate.reviewedBy, 'ari:cloud:jira:admin-1');
  assert.equal(result.updatedCandidate.reviewedAt, '2026-01-11T12:00:00.000Z');

  assert.equal(result.auditLog.action, 'confirm_candidate');
  assert.equal(result.auditLog.targetId, 'dec-fixed-id');
});

test('confirmCandidateProposal respects human edits to statement, rationale, and scope', () => {
  const result = confirmCandidateProposal({
    candidate: mockCandidate,
    reviewerId: 'ari:cloud:jira:admin-1',
    statement: 'Standardize on OpenTelemetry only for Node.js services (edited)',
    rationale: 'Go services already have an established tracer (edited).',
    scope: {
      projectIds: ['CORE'],
      components: ['node-svc'],
      labels: [],
      keywords: ['otel'],
      codePaths: [],
    },
    now: '2026-01-11T12:00:00.000Z',
  });

  assert.equal(
    result.decision.statement,
    'Standardize on OpenTelemetry only for Node.js services (edited)',
  );
  assert.equal(
    result.decision.rationale,
    'Go services already have an established tracer (edited).',
  );
  assert.deepEqual(result.decision.scope.projectIds, ['CORE']);
  assert.deepEqual(result.decision.scope.components, ['node-svc']);
});

test('rejectCandidateProposal marks candidate as rejected with audit entry', () => {
  const result = rejectCandidateProposal({
    candidate: mockCandidate,
    reviewerId: 'ari:cloud:jira:admin-1',
    reason: 'Not a binding decision, only an exploratory suggestion.',
    now: '2026-01-11T12:00:00.000Z',
  });

  assert.equal(result.updatedCandidate.status, 'rejected');
  assert.equal(result.updatedCandidate.reviewedBy, 'ari:cloud:jira:admin-1');
  assert.equal(result.auditLog.action, 'reject_candidate');
  assert.equal(result.auditLog.targetId, mockCandidate.id);
});

test('filterDecisions filters by status, projectId, and query', () => {
  const decisions: Decision[] = [
    {
      id: 'd1',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      statement: 'Use Redis for caching',
      rationale: 'Sub-millisecond latency.',
      owner: null,
      scope: {
        projectIds: ['CORE'],
        components: ['cache'],
        labels: [],
        keywords: ['redis'],
        codePaths: [],
      },
      source: mockCandidate.proposal.source,
      confidence: 0.9,
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      confirmedBy: 'user-1',
      confirmedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'd2',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      statement: 'Old MySQL DB was deprecated',
      rationale: 'Replaced by Postgres.',
      owner: null,
      scope: {
        projectIds: ['INFRA'],
        components: ['database'],
        labels: [],
        keywords: ['mysql'],
        codePaths: [],
      },
      source: mockCandidate.proposal.source,
      confidence: 0.85,
      status: 'superseded',
      createdAt: '2025-01-01T00:00:00.000Z',
      confirmedBy: 'user-1',
      confirmedAt: '2025-01-01T00:00:00.000Z',
    },
  ];

  assert.equal(filterDecisions(decisions, { status: 'active' }).length, 1);
  assert.equal(filterDecisions(decisions, { status: 'superseded' }).length, 1);
  assert.equal(filterDecisions(decisions, { projectId: 'CORE' }).length, 1);
  assert.equal(filterDecisions(decisions, { projectId: 'NON_EXISTENT' }).length, 0);
  assert.equal(filterDecisions(decisions, { query: 'latency' }).length, 1);
  assert.equal(filterDecisions(decisions, { query: 'mysql' }).length, 1);
  assert.equal(filterDecisions(decisions, { query: 'unrelated' }).length, 0);
});

test('filterCandidates filters by status and query', () => {
  const candidates: Candidate[] = [
    mockCandidate,
    {
      ...mockCandidate,
      id: 'cand-002',
      status: 'confirmed',
      proposal: {
        ...mockCandidate.proposal,
        statement: 'Adopt Vitest for fast unit testing',
      },
    },
  ];

  assert.equal(filterCandidates(candidates, { status: 'pending' }).length, 1);
  assert.equal(filterCandidates(candidates, { status: 'confirmed' }).length, 1);
  assert.equal(filterCandidates(candidates, { query: 'Vitest' }).length, 1);
});
