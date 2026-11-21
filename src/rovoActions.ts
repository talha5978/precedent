import {
  decisions as defaultDecisionsRepo,
  relations as defaultRelationsRepo,
  type RecordRepository,
} from './storage/repositories';
import { filterDecisions } from './domain/decisions';
import {
  computeIssueContentHash,
  PatternConflictJudge,
  retrieveCandidateDecisions,
  type IssueInput,
} from './domain/conflict';
import type { Decision, DecisionRelation } from './domain/models';
import api, { route } from '@forge/api';

export type SearchDecisionsInput = {
  query: string;
  status?: string;
  projectId?: string;
};

export type GetDecisionInput = {
  id: string;
};

export type CheckIssueConflictsInput = {
  issueKey: string;
  mockIssue?: IssueInput;
};

export type RovoContext = {
  decisionsRepo?: RecordRepository<Decision>;
  relationsRepo?: RecordRepository<DecisionRelation>;
};

/**
 * Searches the Precedent decision registry for active or historical decisions.
 * Enforces evidence over assertion by always returning the source citation.
 */
export async function handleSearchDecisions(
  payload: SearchDecisionsInput,
  context?: RovoContext,
) {
  const query = payload?.query ?? '';
  const status = payload?.status;
  const projectId = payload?.projectId;
  const repo = context?.decisionsRepo ?? defaultDecisionsRepo;

  const page = await repo.list({ limit: 100 });
  const filtered = filterDecisions(page.items, {
    status: status as any,
    projectId,
    query,
  });

  if (filtered.length === 0) {
    return {
      totalFound: 0,
      results: [],
      message: `No decisions found matching query "${query}".`,
    };
  }

  const results = filtered.map((d) => ({
    id: d.id,
    statement: d.statement,
    rationale: d.rationale || 'No explicit rationale recorded.',
    status: d.status,
    owner: d.owner ?? 'Unassigned',
    source: {
      type: d.source.type,
      url: d.source.url,
      quotedExcerpt: d.source.quotedExcerpt,
    },
    governedScope: {
      components: d.scope.components,
      keywords: d.scope.keywords,
      projectIds: d.scope.projectIds,
    },
  }));

  return {
    totalFound: results.length,
    results,
  };
}

/**
 * Retrieves a single decision by ID including its supersession and dependency lineage.
 * If rationale is absent, states "No rationale found" explicitly per Product Principle.
 */
export async function handleGetDecision(
  payload: GetDecisionInput,
  context?: RovoContext,
) {
  const id = payload?.id;
  if (!id) {
    return { error: 'Decision ID is required.' };
  }

  const decRepo = context?.decisionsRepo ?? defaultDecisionsRepo;
  const relRepo = context?.relationsRepo ?? defaultRelationsRepo;

  const decision = await decRepo.get(id);
  if (!decision) {
    return {
      error: `Decision "${id}" was not found in the Precedent registry.`,
    };
  }

  const allRelations = await relRepo.list({ limit: 100 });
  const linkedRelations = allRelations.items.filter(
    (r) => r.fromId === id || r.toId === id,
  );

  const lineage = linkedRelations.map((r) => ({
    relationType: r.type,
    fromDecisionId: r.fromId,
    toDecisionId: r.toId,
    reason: r.reason || 'No lineage reason documented.',
    createdAt: r.createdAt,
  }));

  return {
    id: decision.id,
    statement: decision.statement,
    rationale: decision.rationale?.trim() ? decision.rationale : 'No rationale found',
    status: decision.status,
    owner: decision.owner ?? 'Unassigned',
    confirmedBy: decision.confirmedBy,
    confirmedAt: decision.confirmedAt,
    source: {
      type: decision.source.type,
      url: decision.source.url,
      quotedExcerpt: decision.source.quotedExcerpt,
    },
    lineage,
  };
}

/**
 * Evaluates a Jira issue against active decisions to identify contradictions.
 */
export async function handleCheckIssueConflicts(
  payload: CheckIssueConflictsInput,
  context?: RovoContext,
) {
  const issueKey = payload?.issueKey;
  if (!issueKey) {
    return { error: 'issueKey is required to check conflicts.' };
  }

  let issueInput: IssueInput;

  if (payload.mockIssue) {
    issueInput = payload.mockIssue;
  } else {
    let summary = '';
    let description = '';
    let components: string[] = [];
    let labels: string[] = [];

    try {
      const jiraRes = await api
        .asUser()
        .requestJira(route`/rest/api/3/issue/${issueKey}?fields=summary,description,components,labels`);
      if (jiraRes.ok) {
        const data = (await jiraRes.json()) as any;
        summary = data.fields?.summary ?? '';
        description = typeof data.fields?.description === 'string'
          ? data.fields.description
          : JSON.stringify(data.fields?.description ?? '');
        components = (data.fields?.components ?? [])
          .map((c: any) => c.name)
          .filter((n: any): n is string => typeof n === 'string');
        labels = data.fields?.labels ?? [];
      }
    } catch {
      summary = `Issue ${issueKey}`;
    }

    issueInput = {
      key: issueKey,
      summary,
      description,
      components,
      labels,
    };
  }

  const decRepo = context?.decisionsRepo ?? defaultDecisionsRepo;
  const allDecisions = await decRepo.list({ limit: 100 });
  const activeDecisions = allDecisions.items.filter((d) => d.status === 'active');

  const candidatesToJudge = retrieveCandidateDecisions(activeDecisions, issueInput, 5);
  const judge = new PatternConflictJudge();

  const detectedConflicts: any[] = [];

  for (const dec of candidatesToJudge) {
    const judgment = await judge.judge(dec, issueInput);
    if (judgment.verdict !== 'no_conflict') {
      detectedConflicts.push({
        decisionId: dec.id,
        statement: dec.statement,
        priorRationale: dec.rationale || 'No rationale recorded',
        sourceUrl: dec.source.url,
        verdict: judgment.verdict,
        confidence: Math.round(judgment.confidence * 100) / 100,
        explanation: judgment.explanation,
        triggeringPhrases: judgment.triggeringPhrases,
      });
    }
  }

  if (detectedConflicts.length === 0) {
    return {
      issueKey,
      hasConflicts: false,
      message: 'All clear: No contradictions detected with active team decisions.',
      conflicts: [],
    };
  }

  return {
    issueKey,
    hasConflicts: true,
    message: `Warning: ${detectedConflicts.length} active decision contradiction(s) detected for issue ${issueKey}.`,
    conflicts: detectedConflicts,
  };
}
