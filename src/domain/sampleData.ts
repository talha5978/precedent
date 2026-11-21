import {
  CURRENT_SCHEMA_VERSION,
  type Candidate,
  type Decision,
} from './models';

export function getSampleDecisions(): Decision[] {
  return [
    {
      id: 'dec_sample_postgres',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      statement: 'Mandate PostgreSQL 16 for all relational persistence across core services',
      rationale:
        'ACID transactions, robust JSONB support, extensive tooling, and deep operational familiarity across the platform team.',
      status: 'active',
      owner: 'Lead Database Architect',
      scope: {
        projectIds: [],
        components: ['database', 'persistence', 'storage'],
        labels: ['architecture', 'db'],
        keywords: ['postgres', 'postgresql', 'sql', 'relational', 'rdbms'],
        codePaths: [],
      },
      source: {
        type: 'page',
        id: 'conf_adr_001',
        url: 'https://confluence.example.com/display/ENG/ADR-001-Primary-Database-Standard',
        quotedExcerpt:
          'Decision: All new persistent services must use PostgreSQL 16 managed instances. No new MySQL or Mongo deployments without explicit architecture waiver.',
        contentHash: 'hash_adr_001',
      },
      confidence: 0.98,
      createdAt: '2026-01-15T09:30:00.000Z',
      confirmedBy: 'Site Administrator',
      confirmedAt: '2026-01-15T10:00:00.000Z',
    },
    {
      id: 'dec_sample_otel',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      statement: 'Standardize on OpenTelemetry for distributed tracing and metrics',
      rationale:
        'Vendor neutrality, unified correlation across trace and log contexts, and native support in modern cloud exporters.',
      status: 'active',
      owner: 'Platform Observability Team',
      scope: {
        projectIds: [],
        components: ['telemetry', 'monitoring', 'observability'],
        labels: ['observability', 'infra'],
        keywords: ['opentelemetry', 'otel', 'jaeger', 'tracing', 'datadog'],
        codePaths: [],
      },
      source: {
        type: 'page',
        id: 'conf_adr_002',
        url: 'https://confluence.example.com/display/ENG/ADR-002-Observability-Standard',
        quotedExcerpt:
          'Decision: Adopt OpenTelemetry SDKs across all Node.js and Go services. Custom homegrown instrumentation is deprecated.',
        contentHash: 'hash_adr_002',
      },
      confidence: 0.95,
      createdAt: '2026-02-01T14:00:00.000Z',
      confirmedBy: 'Site Administrator',
      confirmedAt: '2026-02-01T14:30:00.000Z',
    },
    {
      id: 'dec_sample_grpc_internal',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      statement: 'Use gRPC with Protobuf for internal service-to-service synchronous communication',
      rationale:
        'Strict schema contracts, bidirectional streaming, and high throughput compared to internal JSON-over-HTTP.',
      status: 'active',
      owner: 'Backend Platform Lead',
      scope: {
        projectIds: [],
        components: ['api', 'rpc', 'networking'],
        labels: ['architecture', 'api'],
        keywords: ['grpc', 'protobuf', 'rpc', 'inter-service'],
        codePaths: [],
      },
      source: {
        type: 'comment',
        id: 'jira_comm_303',
        url: 'https://jira.example.com/browse/ARCH-45#comment-303',
        quotedExcerpt:
          'We decided in the architecture review: all synchronous backend-to-backend calls must use gRPC with generated protobuf stubs.',
        contentHash: 'hash_comm_303',
      },
      confidence: 0.92,
      createdAt: '2026-02-15T11:15:00.000Z',
      confirmedBy: 'Site Administrator',
      confirmedAt: '2026-02-15T11:30:00.000Z',
    },
    {
      id: 'dec_sample_redis_cache',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      statement: 'Use Redis exclusively as an ephemeral cache with TTL, never as permanent store',
      rationale:
        'In-memory persistence risks silent data loss on node failover; all source-of-truth state must live in PostgreSQL.',
      status: 'active',
      owner: 'Infrastructure Lead',
      scope: {
        projectIds: [],
        components: ['cache', 'redis'],
        labels: ['cache', 'infra'],
        keywords: ['redis', 'caching', 'ttl', 'ephemeral', 'session'],
        codePaths: [],
      },
      source: {
        type: 'page',
        id: 'conf_adr_003',
        url: 'https://confluence.example.com/display/ENG/ADR-003-Caching-Rules',
        quotedExcerpt:
          'Decision: Redis is an eviction-safe cache only. Every key must have a TTL and must be reconstructible from the database.',
        contentHash: 'hash_adr_003',
      },
      confidence: 0.94,
      createdAt: '2026-02-20T16:00:00.000Z',
      confirmedBy: 'Site Administrator',
      confirmedAt: '2026-02-20T16:15:00.000Z',
    },
  ];
}

export function getSampleCandidates(): Candidate[] {
  return [
    {
      id: 'cand_sample_graphql',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      proposal: {
        statement: 'Require GraphQL federation gateway for public client-facing APIs',
        rationale:
          'Allows frontend applications to query data across multiple subgraphs with a single roundtrip and strongly typed schemas.',
        owner: 'Frontend Platform Guild',
        scope: {
          projectIds: [],
          components: ['api-gateway', 'frontend-api'],
          labels: ['graphql', 'gateway'],
          keywords: ['graphql', 'apollo', 'federation', 'subgraph', 'bff'],
          codePaths: ['src/gateway', 'src/schema'],
        },
        source: {
          type: 'page',
          id: 'conf_notes_89',
          url: 'https://confluence.example.com/display/ENG/Guild-Meeting-2026-03',
          quotedExcerpt:
            'Agreed in guild meeting: We will deploy Apollo Federation as the single unified endpoint for web and mobile.',
          contentHash: 'hash_notes_89',
        },
        confidence: 0.89,
      },
      status: 'pending',
      createdAt: '2026-03-01T15:20:00.000Z',
    },
    {
      id: 'cand_sample_node20_deprecate',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      proposal: {
        statement: 'Deprecate Node.js 18 and enforce Node.js 22 LTS for all Lambda microservices',
        rationale:
          'Node 18 reaches end-of-life; upgrading brings native WebSocket client, test runner, and security fixes.',
        owner: 'Security Operations',
        scope: {
          projectIds: [],
          components: ['runtime', 'lambda'],
          labels: ['security', 'compliance'],
          keywords: ['node', 'nodejs', 'lts', 'upgrade', 'runtime'],
          codePaths: ['package.json', '.nvmrc'],
        },
        source: {
          type: 'comment',
          id: 'jira_comm_sec_12',
          url: 'https://jira.example.com/browse/SEC-104#comment-12',
          quotedExcerpt:
            'Security mandate: All Lambdas must target nodejs22.x by the end of Q2. Deployments targeting Node 18 will be blocked.',
          contentHash: 'hash_comm_sec_12',
        },
        confidence: 0.91,
      },
      status: 'pending',
      createdAt: '2026-03-02T11:00:00.000Z',
    },
  ];
}
