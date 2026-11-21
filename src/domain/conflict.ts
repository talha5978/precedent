import {
  CURRENT_SCHEMA_VERSION,
  type AuditLog,
  type Decision,
  type DecisionRelation,
  type Resolution,
  type Verdict,
  type VerdictKind,
} from './models';
import { decisionMatchesIssue, type IssueScopeContext } from './scoping';

export type IssueInput = {
  key: string;
  summary: string;
  description?: string;
  components?: string[];
  labels?: string[];
  codePaths?: string[];
};

export type JudgmentResult = {
  verdict: VerdictKind;
  confidence: number;
  explanation: string;
  triggeringPhrases: string[];
};

export interface ConflictJudge {
  judge(decision: Decision, issue: IssueInput): Promise<JudgmentResult>;
}

/** Fast, deterministic string hashing for issue content caching */
export function computeContentHash(content: string): string {
  let hash = 5381;
  for (let i = 0; i < content.length; i += 1) {
    hash = (hash * 33) ^ content.charCodeAt(i);
  }
  return `hash_${(hash >>> 0).toString(16)}`;
}

export function computeIssueContentHash(issue: IssueInput): string {
  const normalized = `${issue.key}:${issue.summary.trim()}:${(issue.description ?? '').trim()}`;
  return computeContentHash(normalized);
}

/**
 * Stage 1: Retrieval
 * Narrows active decisions down to candidate decisions in scope, ranked by lexical and structural relevance.
 */
export function retrieveCandidateDecisions(
  activeDecisions: readonly Decision[],
  issue: IssueInput,
  topK = 5,
): Decision[] {
  const projectKey = issue.key.split('-')[0] ?? '';
  const issueContext: IssueScopeContext = {
    projectIds: [projectKey],
    components: issue.components,
    labels: issue.labels,
    searchableText: `${issue.summary} ${issue.description ?? ''}`,
    codePaths: issue.codePaths,
  };

  const inScope = activeDecisions.filter(
    (dec) => dec.status === 'active' && decisionMatchesIssue(dec.scope, issueContext),
  );

  const searchableLower = (issueContext.searchableText ?? '').toLowerCase();

  // Score each in-scope decision
  const scored = inScope.map((decision) => {
    let score = 0;

    // Component overlap bonus
    if (issue.components && issue.components.length > 0) {
      const issueCompSet = new Set(issue.components.map((c) => c.toLowerCase()));
      for (const comp of decision.scope.components) {
        if (issueCompSet.has(comp.toLowerCase())) score += 3;
      }
    }

    // Label overlap bonus
    if (issue.labels && issue.labels.length > 0) {
      const issueLabelSet = new Set(issue.labels.map((l) => l.toLowerCase()));
      for (const label of decision.scope.labels) {
        if (issueLabelSet.has(label.toLowerCase())) score += 2;
      }
    }

    // Keyword hits in issue text
    for (const kw of decision.scope.keywords) {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const matches = searchableLower.match(new RegExp(`\\b${escaped}\\b`, 'gu'));
      if (matches) score += matches.length * 2;
    }

    // Statement lexical overlap
    const statementWords = decision.statement
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3);
    for (const word of statementWords) {
      if (searchableLower.includes(word)) score += 1;
    }

    return { decision, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map(({ decision }) => decision);
}

/**
 * Stage 2: Heuristic & Pattern Conflict Judge
 * Evaluates whether an issue text proposes something that contradicts an active decision.
 */
export class PatternConflictJudge implements ConflictJudge {
  async judge(decision: Decision, issue: IssueInput): Promise<JudgmentResult> {
    const text = `${issue.summary} ${issue.description ?? ''}`.toLowerCase();
    const statement = decision.statement.toLowerCase();

    // Check for explicit contradiction patterns:
    // e.g. Mandate Postgres vs Proposing MongoDB / MySQL
    if (statement.includes('postgres') && (text.includes('mongodb') || text.includes('mongo') || text.includes('mysql') || text.includes('dynamodb'))) {
      const phrases = [];
      if (text.includes('mongodb') || text.includes('mongo')) phrases.push('proposing MongoDB');
      if (text.includes('mysql')) phrases.push('proposing MySQL');
      if (text.includes('dynamodb')) phrases.push('proposing DynamoDB');

      return {
        verdict: 'conflict',
        confidence: 0.94,
        explanation: `Issue proposes an alternative database (${phrases.join(', ')}), which contradicts the mandate: "${decision.statement}".`,
        triggeringPhrases: phrases,
      };
    }

    // e.g. Ephemeral cache only vs Permanent/Persistent store
    if (statement.includes('ephemeral') && (text.includes('permanent store') || text.includes('persistent store') || text.includes('source of truth') || text.includes('primary store'))) {
      return {
        verdict: 'conflict',
        confidence: 0.92,
        explanation: `Issue proposes using cache as a persistent store, contradicting: "${decision.statement}".`,
        triggeringPhrases: ['using cache as persistent / source-of-truth storage'],
      };
    }

    // e.g. OpenTelemetry vs Datadog standalone / Prometheus custom
    if (statement.includes('opentelemetry') && (text.includes('custom tracer') || text.includes('homegrown telemetry') || text.includes('bypass opentelemetry'))) {
      return {
        verdict: 'conflict',
        confidence: 0.89,
        explanation: `Issue proposes custom/homegrown telemetry, contradicting the OpenTelemetry mandate: "${decision.statement}".`,
        triggeringPhrases: ['custom/homegrown telemetry'],
      };
    }

    // e.g. gRPC vs REST for internal service-to-service
    if (statement.includes('grpc') && text.includes('internal') && text.includes('rest api')) {
      return {
        verdict: 'possible_conflict',
        confidence: 0.72,
        explanation: `Issue mentions internal REST API, which may conflict with the gRPC mandate for internal communication: "${decision.statement}".`,
        triggeringPhrases: ['internal REST API'],
      };
    }

    // Check for keyword co-occurrences that may represent a possible conflict / drift
    const clashingKeywords = decision.scope.keywords.filter((kw) => text.includes(kw.toLowerCase()));
    if (clashingKeywords.length >= 2 && (text.includes('replace') || text.includes('migrate from') || text.includes('instead of') || text.includes('alternative to'))) {
      return {
        verdict: 'possible_conflict',
        confidence: 0.65,
        explanation: `Issue discusses replacing or migrating governed technology (${clashingKeywords.join(', ')}), potentially contradicting: "${decision.statement}".`,
        triggeringPhrases: [`discussions around replacing ${clashingKeywords.join(', ')}`],
      };
    }

    return {
      verdict: 'no_conflict',
      confidence: 0.95,
      explanation: 'No contradiction detected between this issue and active decisions.',
      triggeringPhrases: [],
    };
  }
}

/**
 * Resolution Workflows
 */

export function resolveWithComply(
  verdict: Verdict,
  actor: string,
  note: string,
  now = new Date().toISOString(),
): { resolution: Resolution; auditLog: AuditLog } {
  const resolution: Resolution = {
    id: `res_comply_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    verdictId: verdict.id,
    action: 'comply',
    actor,
    note: note.trim(),
    createdAt: now,
  };

  const auditLog: AuditLog = {
    id: `audit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    actor,
    action: 'comply_conflict',
    targetType: 'resolution',
    targetId: resolution.id,
    before: { verdictId: verdict.id, issueKey: verdict.issueKey },
    after: { action: 'comply', note: resolution.note },
    timestamp: now,
  };

  return { resolution, auditLog };
}

export function resolveWithSupersede(
  verdict: Verdict,
  oldDecision: Decision,
  newStatement: string,
  newRationale: string,
  actor: string,
  now = new Date().toISOString(),
): {
  newDecision: Decision;
  supersededDecision: Decision;
  relation: DecisionRelation;
  resolution: Resolution;
  auditLog: AuditLog;
} {
  const newDecisionId = `dec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const newDecision: Decision = {
    id: newDecisionId,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    statement: newStatement.trim(),
    rationale: newRationale.trim(),
    status: 'active',
    owner: actor,
    scope: oldDecision.scope,
    source: {
      type: 'comment',
      id: verdict.issueKey,
      url: `https://jira.example.com/browse/${verdict.issueKey}`,
      quotedExcerpt: `Superseded from issue ${verdict.issueKey}: ${newStatement.trim()}`,
      contentHash: computeContentHash(newStatement),
    },
    confidence: 1.0,
    createdAt: now,
    confirmedBy: actor,
    confirmedAt: now,
  };

  const supersededDecision: Decision = {
    ...oldDecision,
    status: 'superseded',
  };

  const relation: DecisionRelation = {
    id: `rel_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    fromId: newDecision.id,
    toId: oldDecision.id,
    type: 'supersedes',
    createdBy: actor,
    createdAt: now,
    reason: `Superseded during conflict resolution on issue ${verdict.issueKey}: ${newRationale.trim()}`,
  };

  const resolution: Resolution = {
    id: `res_sup_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    verdictId: verdict.id,
    action: 'supersede',
    actor,
    note: `Superseded decision ${oldDecision.id} with new decision ${newDecision.id}`,
    newDecisionId: newDecision.id,
    createdAt: now,
  };

  const auditLog: AuditLog = {
    id: `audit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    actor,
    action: 'supersede_decision',
    targetType: 'decision',
    targetId: newDecision.id,
    before: { oldDecisionId: oldDecision.id, previousStatus: oldDecision.status },
    after: { newDecisionId: newDecision.id, supersededDecisionId: oldDecision.id },
    timestamp: now,
  };

  return { newDecision, supersededDecision, relation, resolution, auditLog };
}

export function resolveWithException(
  verdict: Verdict,
  actor: string,
  note: string,
  expiryDate: string,
  now = new Date().toISOString(),
): { resolution: Resolution; auditLog: AuditLog } {
  const resolution: Resolution = {
    id: `res_exc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    verdictId: verdict.id,
    action: 'exception',
    actor,
    note: note.trim(),
    exceptionExpiry: expiryDate,
    createdAt: now,
  };

  const auditLog: AuditLog = {
    id: `audit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    actor,
    action: 'grant_exception',
    targetType: 'resolution',
    targetId: resolution.id,
    before: { verdictId: verdict.id, issueKey: verdict.issueKey },
    after: { action: 'exception', note: resolution.note, expiry: expiryDate },
    timestamp: now,
  };

  return { resolution, auditLog };
}
