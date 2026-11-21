import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIdempotentCandidates,
  chunkBySections,
  HeuristicDecisionExtractor,
  type SourceContext,
} from '../extractor.ts';
import { CURRENT_SCHEMA_VERSION, type Candidate } from '../models.ts';

const extractor = new HeuristicDecisionExtractor();
const mockContext: SourceContext = {
  type: 'page',
  id: 'page_adr_99',
  url: 'https://acme.atlassian.net/wiki/spaces/ENG/pages/99',
  spaceKey: 'ENG',
  projectId: 'CORE',
};

test('chunkBySections splits markdown document into heading-scoped blocks', () => {
  const markdown = `
# Context
We are evaluating event messaging options.

## Decision
We decided to adopt Apache Kafka for high-throughput event streaming.

## Rationale
Because RabbitMQ could not handle 50k events/sec.
  `.trim();

  const sections = chunkBySections(markdown);
  assert.equal(sections.length, 3);
  assert.equal(sections[0]?.heading, 'Context');
  assert.equal(sections[1]?.heading, 'Decision');
  assert.ok(sections[1]?.body.includes('Apache Kafka'));
});

test('HeuristicDecisionExtractor extracts decision and rationale', async () => {
  const content = `
## Architectural Standard
Decision: We mandate PostgreSQL 16 for all persistent database storage.
Rationale: Because ACID compliance is non-negotiable for billing.
  `.trim();

  const proposals = await extractor.extract(content, mockContext);
  assert.equal(proposals.length, 1);

  const first = proposals[0]!;
  assert.ok(first.statement.toLowerCase().includes('postgresql 16'));
  assert.ok(first.rationale.toLowerCase().includes('acid compliance'));
  assert.deepEqual(first.scope.projectIds, ['CORE']);
  assert.ok(first.scope.components.includes('database'));
});

test('buildIdempotentCandidates prevents duplicate candidate creation on identical source and hash', () => {
  const proposal = {
    statement: 'Standardize on Vite for frontend bundles',
    rationale: 'Sub-second HMR and native ESM support.',
    owner: null,
    scope: { projectIds: [], components: ['frontend'], labels: [], keywords: ['vite'], codePaths: [] },
    source: {
      type: 'comment' as const,
      id: 'jira_comm_55',
      url: 'https://acme.atlassian.net/browse/WEB-1#comment-55',
      quotedExcerpt: 'Decision: Standardize on Vite for frontend bundles',
      contentHash: 'hash_vite_55',
    },
    confidence: 0.9,
  };

  const existingCandidate: Candidate = {
    id: 'cand_existing_1',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    proposal,
    status: 'pending',
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  const newCandidates = buildIdempotentCandidates([proposal], [existingCandidate]);
  assert.equal(newCandidates.length, 0); // Correctly skipped duplicate!

  const differentProposal = {
    ...proposal,
    source: {
      ...proposal.source,
      contentHash: 'hash_different_content',
    },
  };

  const uniqueCandidates = buildIdempotentCandidates([differentProposal], [existingCandidate]);
  assert.equal(uniqueCandidates.length, 1);
  assert.equal(uniqueCandidates[0]?.proposal.source.contentHash, 'hash_different_content');
});
