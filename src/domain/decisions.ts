import {
  CURRENT_SCHEMA_VERSION,
  type AuditLog,
  type Candidate,
  type CandidateStatus,
  type Decision,
  type DecisionScope,
  type DecisionStatus,
} from './models';
import { normalizeDecisionScope } from './scoping';

export type CandidateConfirmationInput = {
  candidate: Candidate;
  reviewerId: string;
  statement?: string;
  rationale?: string;
  scope?: DecisionScope;
  now?: string;
  decisionIdGenerator?: () => string;
};

export type CandidateConfirmationResult = {
  decision: Decision;
  updatedCandidate: Candidate;
  auditLog: AuditLog;
};

export type CandidateRejectionInput = {
  candidate: Candidate;
  reviewerId: string;
  reason?: string;
  now?: string;
};

export type CandidateRejectionResult = {
  updatedCandidate: Candidate;
  auditLog: AuditLog;
};

function defaultIdGenerator(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `dec_${timestamp}_${random}`;
}

export function confirmCandidateProposal(input: CandidateConfirmationInput): CandidateConfirmationResult {
  const timestamp = input.now ?? new Date().toISOString();
  const decisionId = input.decisionIdGenerator ? input.decisionIdGenerator() : defaultIdGenerator();

  const finalStatement = input.statement?.trim() || input.candidate.proposal.statement;
  const finalRationale = input.rationale?.trim() || input.candidate.proposal.rationale;
  const finalScope = input.scope
    ? normalizeDecisionScope(input.scope)
    : normalizeDecisionScope(input.candidate.proposal.scope);

  const decision: Decision = {
    id: decisionId,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    statement: finalStatement,
    rationale: finalRationale,
    owner: input.candidate.proposal.owner,
    scope: finalScope,
    source: input.candidate.proposal.source,
    confidence: input.candidate.proposal.confidence,
    status: 'active',
    createdAt: input.candidate.createdAt,
    confirmedBy: input.reviewerId,
    confirmedAt: timestamp,
  };

  const updatedCandidate: Candidate = {
    ...input.candidate,
    status: 'confirmed',
    reviewedBy: input.reviewerId,
    reviewedAt: timestamp,
  };

  const auditLog: AuditLog = {
    id: `audit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    actor: input.reviewerId,
    action: 'confirm_candidate',
    targetType: 'decision',
    targetId: decision.id,
    before: { candidateId: input.candidate.id, previousStatus: input.candidate.status },
    after: { decisionId: decision.id, statement: decision.statement },
    timestamp,
  };

  return { decision, updatedCandidate, auditLog };
}

export function rejectCandidateProposal(input: CandidateRejectionInput): CandidateRejectionResult {
  const timestamp = input.now ?? new Date().toISOString();

  const updatedCandidate: Candidate = {
    ...input.candidate,
    status: 'rejected',
    reviewedBy: input.reviewerId,
    reviewedAt: timestamp,
  };

  const auditLog: AuditLog = {
    id: `audit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    actor: input.reviewerId,
    action: 'reject_candidate',
    targetType: 'candidate',
    targetId: input.candidate.id,
    before: { candidateId: input.candidate.id, previousStatus: input.candidate.status },
    after: { candidateId: input.candidate.id, status: 'rejected', reason: input.reason ?? null },
    timestamp,
  };

  return { updatedCandidate, auditLog };
}

export function filterDecisions(
  decisions: readonly Decision[],
  criteria: {
    status?: DecisionStatus;
    projectId?: string;
    query?: string;
  },
): Decision[] {
  const normalizedQuery = criteria.query?.trim().toLowerCase();

  return decisions.filter((decision) => {
    if (criteria.status && decision.status !== criteria.status) {
      return false;
    }

    if (criteria.projectId) {
      const matchesProject =
        decision.scope.projectIds.length === 0 || decision.scope.projectIds.includes(criteria.projectId);
      if (!matchesProject) return false;
    }

    if (normalizedQuery) {
      const matchInStatement = decision.statement.toLowerCase().includes(normalizedQuery);
      const matchInRationale = decision.rationale.toLowerCase().includes(normalizedQuery);
      const matchInKeywords = decision.scope.keywords.some((kw) => kw.toLowerCase().includes(normalizedQuery));
      if (!matchInStatement && !matchInRationale && !matchInKeywords) return false;
    }

    return true;
  });
}

export function filterCandidates(
  candidates: readonly Candidate[],
  criteria: {
    status?: CandidateStatus;
    query?: string;
  },
): Candidate[] {
  const normalizedQuery = criteria.query?.trim().toLowerCase();

  return candidates.filter((candidate) => {
    if (criteria.status && candidate.status !== criteria.status) {
      return false;
    }

    if (normalizedQuery) {
      const matchInStatement = candidate.proposal.statement.toLowerCase().includes(normalizedQuery);
      const matchInRationale = candidate.proposal.rationale.toLowerCase().includes(normalizedQuery);
      if (!matchInStatement && !matchInRationale) return false;
    }

    return true;
  });
}
