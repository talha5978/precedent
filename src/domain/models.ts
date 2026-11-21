export const CURRENT_SCHEMA_VERSION = 1 as const;

export type DecisionStatus = 'active' | 'superseded' | 'expired' | 'under_review';
export type CandidateStatus = 'pending' | 'confirmed' | 'rejected' | 'merged';
export type VerdictKind = 'conflict' | 'possible_conflict' | 'no_conflict';
export type RelationKind = 'supersedes' | 'depends_on' | 'related_to';
export type SourceType = 'page' | 'comment';

export type DecisionScope = {
  projectIds: string[];
  components: string[];
  labels: string[];
  keywords: string[];
  codePaths: string[];
};

export type DecisionSource = {
  type: SourceType;
  id: string;
  url: string;
  quotedExcerpt: string;
  contentHash: string;
};

export type DecisionProposal = {
  statement: string;
  rationale: string;
  owner: string | null;
  scope: DecisionScope;
  source: DecisionSource;
  confidence: number;
};

export type Decision = DecisionProposal & {
  id: string;
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  status: DecisionStatus;
  createdAt: string;
  confirmedBy: string;
  confirmedAt: string;
  reviewDate?: string;
};

export type DecisionRelation = {
  id: string;
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  fromId: string;
  toId: string;
  type: RelationKind;
  createdBy: string;
  createdAt: string;
  reason: string;
};

export type Candidate = {
  id: string;
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  proposal: DecisionProposal;
  status: CandidateStatus;
  mergeTargetId?: string;
  createdAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
};

export type Verdict = {
  id: string;
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  issueKey: string;
  decisionId: string;
  verdict: VerdictKind;
  confidence: number;
  explanation: string;
  triggeringPhrases: string[];
  issueContentHash: string;
  createdAt: string;
  modelVersion: string;
};

export type Resolution = {
  id: string;
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  verdictId: string;
  action: 'comply' | 'supersede' | 'exception';
  actor: string;
  note: string;
  newDecisionId?: string;
  exceptionExpiry?: string;
  createdAt: string;
};

export type Feedback = {
  id: string;
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  targetType: 'candidate' | 'verdict';
  targetId: string;
  helpful: boolean;
  comment?: string;
  actor: string;
  createdAt: string;
};

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type AuditLog = {
  id: string;
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  actor: string;
  action: string;
  targetType: 'decision' | 'candidate' | 'verdict' | 'resolution' | 'settings';
  targetId: string;
  before?: JsonValue;
  after?: JsonValue;
  timestamp: string;
};

export type Settings = {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  includedProjectIds: string[];
  includedSpaceIds: string[];
  confidenceThreshold: number;
  possibleConflictThreshold: number;
  supersederRoleIds: string[];
  exceptionApproverRoleIds: string[];
  notifications: {
    enabled: boolean;
    ownerAlerts: boolean;
    dependentAlerts: boolean;
  };
  updatedAt: string;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0;
}

function isIsoDate(value: unknown): value is string {
  return isString(value) && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isConfidence(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isEnum<const T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === 'string' && values.includes(value);
}

const decisionStatuses = ['active', 'superseded', 'expired', 'under_review'] as const;
const candidateStatuses = ['pending', 'confirmed', 'rejected', 'merged'] as const;
const verdictKinds = ['conflict', 'possible_conflict', 'no_conflict'] as const;
const relationKinds = ['supersedes', 'depends_on', 'related_to'] as const;

export function isDecisionScope(value: unknown): value is DecisionScope {
  return (
    isRecord(value) &&
    isStringArray(value.projectIds) &&
    isStringArray(value.components) &&
    isStringArray(value.labels) &&
    isStringArray(value.keywords) &&
    isStringArray(value.codePaths)
  );
}

export function isDecisionSource(value: unknown): value is DecisionSource {
  return (
    isRecord(value) &&
    isEnum(value.type, ['page', 'comment'] as const) &&
    isNonEmptyString(value.id) &&
    isString(value.url) &&
    isString(value.quotedExcerpt) &&
    isNonEmptyString(value.contentHash)
  );
}

export function isDecisionProposal(value: unknown): value is DecisionProposal {
  return (
    isRecord(value) &&
    isNonEmptyString(value.statement) &&
    isString(value.rationale) &&
    (value.owner === null || isString(value.owner)) &&
    isDecisionScope(value.scope) &&
    isDecisionSource(value.source) &&
    isConfidence(value.confidence)
  );
}

function hasIdentity(value: UnknownRecord): boolean {
  return isNonEmptyString(value.id) && value.schemaVersion === CURRENT_SCHEMA_VERSION;
}

export function parseDecision(value: unknown): Decision | undefined {
  if (!isRecord(value) || !hasIdentity(value) || !isDecisionProposal(value)) return undefined;
  const decision = value as UnknownRecord & DecisionProposal;
  if (
    !isEnum(decision.status, decisionStatuses) ||
    !isIsoDate(decision.createdAt) ||
    !isNonEmptyString(decision.confirmedBy) ||
    !isIsoDate(decision.confirmedAt) ||
    (decision.reviewDate !== undefined && !isIsoDate(decision.reviewDate))
  ) {
    return undefined;
  }
  return value as Decision;
}

export function parseDecisionRelation(value: unknown): DecisionRelation | undefined {
  if (!isRecord(value) || !hasIdentity(value)) return undefined;
  if (
    !isNonEmptyString(value.fromId) ||
    !isNonEmptyString(value.toId) ||
    value.fromId === value.toId ||
    !isEnum(value.type, relationKinds) ||
    !isNonEmptyString(value.createdBy) ||
    !isIsoDate(value.createdAt) ||
    !isString(value.reason)
  ) {
    return undefined;
  }
  return value as DecisionRelation;
}

export function parseCandidate(value: unknown): Candidate | undefined {
  if (!isRecord(value) || !hasIdentity(value)) return undefined;
  if (
    !isDecisionProposal(value.proposal) ||
    !isEnum(value.status, candidateStatuses) ||
    !isIsoDate(value.createdAt) ||
    (value.mergeTargetId !== undefined && !isNonEmptyString(value.mergeTargetId)) ||
    (value.reviewedBy !== undefined && !isNonEmptyString(value.reviewedBy)) ||
    (value.reviewedAt !== undefined && !isIsoDate(value.reviewedAt))
  ) {
    return undefined;
  }
  if (value.status === 'merged' && !isNonEmptyString(value.mergeTargetId)) return undefined;
  return value as Candidate;
}

export function parseVerdict(value: unknown): Verdict | undefined {
  if (!isRecord(value) || !hasIdentity(value)) return undefined;
  if (
    !isNonEmptyString(value.issueKey) ||
    !isNonEmptyString(value.decisionId) ||
    !isEnum(value.verdict, verdictKinds) ||
    !isConfidence(value.confidence) ||
    !isString(value.explanation) ||
    !isStringArray(value.triggeringPhrases) ||
    !isNonEmptyString(value.issueContentHash) ||
    !isIsoDate(value.createdAt) ||
    !isNonEmptyString(value.modelVersion)
  ) {
    return undefined;
  }
  return value as Verdict;
}

export function parseResolution(value: unknown): Resolution | undefined {
  if (!isRecord(value) || !hasIdentity(value)) return undefined;
  if (
    !isNonEmptyString(value.verdictId) ||
    !isEnum(value.action, ['comply', 'supersede', 'exception'] as const) ||
    !isNonEmptyString(value.actor) ||
    !isString(value.note) ||
    (value.newDecisionId !== undefined && !isNonEmptyString(value.newDecisionId)) ||
    (value.exceptionExpiry !== undefined && !isIsoDate(value.exceptionExpiry)) ||
    !isIsoDate(value.createdAt)
  ) {
    return undefined;
  }
  if (value.action === 'supersede' && !isNonEmptyString(value.newDecisionId)) return undefined;
  if (value.action === 'exception' && !isIsoDate(value.exceptionExpiry)) return undefined;
  return value as Resolution;
}

export function parseFeedback(value: unknown): Feedback | undefined {
  if (!isRecord(value) || !hasIdentity(value)) return undefined;
  if (
    !isEnum(value.targetType, ['candidate', 'verdict'] as const) ||
    !isNonEmptyString(value.targetId) ||
    typeof value.helpful !== 'boolean' ||
    (value.comment !== undefined && !isString(value.comment)) ||
    !isNonEmptyString(value.actor) ||
    !isIsoDate(value.createdAt)
  ) {
    return undefined;
  }
  return value as Feedback;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

export function parseAuditLog(value: unknown): AuditLog | undefined {
  if (!isRecord(value) || !hasIdentity(value)) return undefined;
  if (
    !isNonEmptyString(value.actor) ||
    !isNonEmptyString(value.action) ||
    !isEnum(value.targetType, ['decision', 'candidate', 'verdict', 'resolution', 'settings'] as const) ||
    !isNonEmptyString(value.targetId) ||
    (value.before !== undefined && !isJsonValue(value.before)) ||
    (value.after !== undefined && !isJsonValue(value.after)) ||
    !isIsoDate(value.timestamp)
  ) {
    return undefined;
  }
  return value as AuditLog;
}

export function parseSettings(value: unknown): Settings | undefined {
  if (!isRecord(value) || value.schemaVersion !== CURRENT_SCHEMA_VERSION) return undefined;
  if (
    !isStringArray(value.includedProjectIds) ||
    !isStringArray(value.includedSpaceIds) ||
    !isConfidence(value.confidenceThreshold) ||
    !isConfidence(value.possibleConflictThreshold) ||
    value.possibleConflictThreshold > value.confidenceThreshold ||
    !isStringArray(value.supersederRoleIds) ||
    !isStringArray(value.exceptionApproverRoleIds) ||
    !isRecord(value.notifications) ||
    typeof value.notifications.enabled !== 'boolean' ||
    typeof value.notifications.ownerAlerts !== 'boolean' ||
    typeof value.notifications.dependentAlerts !== 'boolean' ||
    !isIsoDate(value.updatedAt)
  ) {
    return undefined;
  }
  return value as Settings;
}
