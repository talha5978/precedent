import test from 'node:test';
import assert from 'node:assert/strict';
import {
  handleSearchDecisions,
  handleGetDecision,
  handleCheckIssueConflicts,
  type RovoContext,
} from '../../rovoActions.ts';
import { getSampleDecisions, getSampleRelations } from '../sampleData.ts';
import type { Decision, DecisionRelation } from '../models.ts';
import type { RecordRepository } from '../../storage/repositories.ts';

function createMockRepo<T extends { id: string }>(initial: T[]): RecordRepository<T> {
  const store = new Map<string, T>();
  for (const item of initial) {
    store.set(item.id, item);
  }

  return {
    async get(id: string) {
      return store.get(id);
    },
    async put(record: T) {
      store.set(record.id, record);
    },
    async delete(id: string) {
      store.delete(id);
    },
    async list() {
      return { items: Array.from(store.values()) };
    },
  };
}

function getTestContext(): RovoContext {
  return {
    decisionsRepo: createMockRepo<Decision>(getSampleDecisions()),
    relationsRepo: createMockRepo<DecisionRelation>(getSampleRelations()),
  };
}

test('Rovo Action: handleSearchDecisions returns matching decisions with sources', async () => {
  const ctx = getTestContext();
  const res = await handleSearchDecisions({ query: 'postgres' }, ctx);
  assert.ok(res.totalFound > 0);
  assert.ok(res.results.some((r) => r.statement.includes('PostgreSQL')));
  // Verify evidence over assertion: source excerpt and url must be provided
  const pgResult = res.results.find((r) => r.statement.includes('PostgreSQL'));
  assert.ok(pgResult?.source.url);
  assert.ok(pgResult?.source.quotedExcerpt);
});

test('Rovo Action: handleSearchDecisions returns explicit empty result for non-existent query', async () => {
  const ctx = getTestContext();
  const res = await handleSearchDecisions({ query: 'nonexistenttechnologyxyz' }, ctx);
  assert.equal(res.totalFound, 0);
  assert.equal(res.results.length, 0);
  assert.ok(res.message.includes('No decisions found'));
});

test('Rovo Action: handleGetDecision returns detailed decision with lineage', async () => {
  const ctx = getTestContext();
  const decId = 'dec_sample_postgres';
  const res = await handleGetDecision({ id: decId }, ctx);
  assert.equal(res.id, decId);
  assert.ok(res.statement.includes('PostgreSQL'));
  assert.ok(res.rationale);
  assert.ok(Array.isArray(res.lineage));
  assert.ok(res.lineage.length > 0);
});

test('Rovo Action: handleGetDecision handles missing decision safely', async () => {
  const ctx = getTestContext();
  const res = await handleGetDecision({ id: 'missing_id_999' }, ctx);
  assert.ok('error' in res);
  assert.ok(res.error.includes('not found'));
});

test('Rovo Action: handleCheckIssueConflicts flags contradictory issue text', async () => {
  const ctx = getTestContext();
  const res = await handleCheckIssueConflicts(
    {
      issueKey: 'ENG-101',
      mockIssue: {
        key: 'ENG-101',
        summary: 'Set up MongoDB for customer order documents instead of sql relational db',
        description: 'We are planning on proposing MongoDB as our main persistence store.',
        components: ['database', 'persistence'],
        labels: ['db'],
      },
    },
    ctx,
  );

  assert.equal(res.hasConflicts, true);
  assert.ok(res.conflicts.length > 0);
  assert.ok(res.conflicts.some((c: any) => c.statement.includes('PostgreSQL')));
});

test('Rovo Action: handleCheckIssueConflicts returns clear status when aligned', async () => {
  const ctx = getTestContext();
  const res = await handleCheckIssueConflicts(
    {
      issueKey: 'ENG-102',
      mockIssue: {
        key: 'ENG-102',
        summary: 'Add PostgreSQL index for user search query optimization',
        description: 'Optimize PostgreSQL schema with composite btree indexes',
        components: ['database'],
        labels: ['db'],
      },
    },
    ctx,
  );

  assert.equal(res.hasConflicts, false);
  assert.ok(res.message.includes('All clear'));
});
