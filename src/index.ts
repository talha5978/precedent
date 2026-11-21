import api, { route } from '@forge/api';
import Resolver from '@forge/resolver';
import {
  auditLogs,
  candidates,
  decisions,
  relations,
  resolutions,
  settingsRepository,
  verdicts,
} from './storage/repositories';
import {
  type ProjectOption,
  type SetupOptions,
  type SetupSettings,
  type SpaceOption,
} from './domain/setup';
import {
  confirmCandidateProposal,
  filterCandidates,
  filterDecisions,
  rejectCandidateProposal,
} from './domain/decisions';
import {
  CURRENT_SCHEMA_VERSION,
  type CandidateStatus,
  type Decision,
  type DecisionProposal,
  type DecisionScope,
  type DecisionStatus,
  type Resolution,
  type Verdict,
} from './domain/models';
import { getSampleCandidates, getSampleDecisions } from './domain/sampleData';
import {
  buildIdempotentCandidates,
  HeuristicDecisionExtractor,
} from './domain/extractor';
import {
  computeIssueContentHash,
  PatternConflictJudge,
  resolveWithComply,
  resolveWithException,
  resolveWithSupersede,
  retrieveCandidateDecisions,
  type IssueInput,
} from './domain/conflict';

const resolver = new Resolver();
const DEFAULT_SETTINGS = {
  schemaVersion: 2 as const,
  includedProjectIds: [] as string[],
  includedSpaceIds: [] as string[],
  confidenceThreshold: 0.8,
  possibleConflictThreshold: 0.55,
  supersederRoleIds: [] as string[],
  exceptionApproverRoleIds: [] as string[],
  notifications: { enabled: false, ownerAlerts: false, dependentAlerts: false },
  updatedAt: new Date(0).toISOString(),
};

type JiraProjectPage = {
  values?: Array<{ id: string | number; key: string; name: string }>;
  total?: number;
};

type ConfluenceSpacePage = {
  results?: Array<{ id: string | number; key: string; name: string }>;
  _links?: { next?: string };
};

function extractAdfText(doc: unknown): string {
  if (typeof doc === 'string') return doc;
  if (!doc || typeof doc !== 'object') return '';
  let text = '';
  function walk(node: unknown) {
    if (node && typeof node === 'object') {
      const rec = node as Record<string, unknown>;
      if (typeof rec.text === 'string') text += ` ${rec.text}`;
      if (Array.isArray(rec.content)) {
        for (const child of rec.content) walk(child);
      }
    }
  }
  walk(doc);
  return text.trim();
}

async function getActorId(context?: { accountId?: string }): Promise<string> {
  if (context?.accountId) return context.accountId;
  try {
    const res = await api.asUser().requestJira(route`/rest/api/3/myself`);
    if (res.ok) {
      const data = (await res.json()) as { accountId?: string; displayName?: string };
      return data.accountId || data.displayName || 'authenticated-user';
    }
  } catch {
    // Fall back to safe fallback
  }
  return 'site-admin';
}

async function loadSetupOptions(): Promise<SetupOptions> {
  const warnings: string[] = [];
  const projects: ProjectOption[] = [];
  let startAt = 0;
  let totalProjects: number | undefined;
  for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
    const jiraResponse = await api
      .asUser()
      .requestJira(route`/rest/api/3/project/search?startAt=${startAt}&maxResults=100`);
    if (!jiraResponse.ok) {
      throw new Error('Could not load Jira projects available to your account.');
    }

    const jiraPage = (await jiraResponse.json()) as JiraProjectPage;
    const values = jiraPage.values ?? [];
    totalProjects = jiraPage.total;
    projects.push(
      ...values.map((project) => ({
        id: String(project.id),
        key: project.key,
        name: project.name,
      })),
    );
    if (values.length === 0 || startAt + values.length >= (totalProjects ?? 0)) break;
    startAt += values.length;
    if (pageNumber === 9 && startAt < (totalProjects ?? 0)) {
      warnings.push('Only the first 1,000 Jira projects are shown.');
    }
  }

  let spaces: SpaceOption[] = [];
  try {
    let cursor: string | undefined;
    for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
      const confluenceResponse = await api
        .asUser()
        .requestConfluence(
          cursor
            ? route`/wiki/api/v2/spaces?limit=100&status=current&cursor=${cursor}`
            : route`/wiki/api/v2/spaces?limit=100&status=current`,
        );
      if (!confluenceResponse.ok) throw new Error('Confluence spaces are unavailable.');

      const confluencePage = (await confluenceResponse.json()) as ConfluenceSpacePage;
      spaces.push(
        ...(confluencePage.results ?? []).map((space) => ({
          id: String(space.id),
          key: space.key,
          name: space.name,
        })),
      );

      const next = confluencePage._links?.next;
      cursor = next
        ? new URL(next, 'https://placeholder.invalid').searchParams.get('cursor') ?? undefined
        : undefined;
      if (!cursor) break;
      if (pageNumber === 9) warnings.push('Only the first 1,000 Confluence spaces are shown.');
    }
  } catch {
    warnings.push('Could not load Confluence spaces. Check Confluence access and app scopes.');
  }

  return { projects, spaces, warnings };
}

resolver.define('getSetup', async () => {
  const [options, savedSettings] = await Promise.all([
    loadSetupOptions(),
    settingsRepository.get(),
  ]);
  const visibleProjects = new Set(options.projects.map(({ id }) => id));
  const visibleSpaces = new Set(options.spaces.map(({ id }) => id));

  return {
    options,
    settings: savedSettings
      ? {
          schemaVersion: 1 as const,
          includedProjectIds: savedSettings.includedProjectIds.filter((id) => visibleProjects.has(id)),
          includedSpaceIds: savedSettings.includedSpaceIds.filter((id) => visibleSpaces.has(id)),
          updatedAt: savedSettings.updatedAt,
        }
      : undefined,
  };
});

resolver.define('saveSetup', async ({ payload }) => {
  const permissionResponse = await api
    .asUser()
    .requestJira(route`/rest/api/3/mypermissions?permissions=ADMINISTER`);
  if (!permissionResponse.ok) throw new Error('Could not verify Jira administrator access.');

  const permissionData = (await permissionResponse.json()) as {
    permissions?: { ADMINISTER?: { havePermission?: boolean } };
  };
  if (!permissionData.permissions?.ADMINISTER?.havePermission) {
    throw new Error('Only a Jira site administrator can save Precedent setup.');
  }

  const input = payload as Partial<SetupSettings> | undefined;
  if (
    !input ||
    !Array.isArray(input.includedProjectIds) ||
    !Array.isArray(input.includedSpaceIds)
  ) {
    throw new Error('Choose projects and spaces before saving setup.');
  }

  const available = await loadSetupOptions();
  const projectIds = new Set(available.projects.map(({ id }) => id));
  const spaceIds = new Set(available.spaces.map(({ id }) => id));
  const includedProjectIds = [...new Set(input.includedProjectIds)].filter(
    (id): id is string => typeof id === 'string' && projectIds.has(id),
  );
  const includedSpaceIds = [...new Set(input.includedSpaceIds)].filter(
    (id): id is string => typeof id === 'string' && spaceIds.has(id),
  );

  if (includedProjectIds.length !== input.includedProjectIds.length) {
    throw new Error('One or more selected Jira projects are unavailable to your account.');
  }
  if (includedSpaceIds.length !== input.includedSpaceIds.length) {
    throw new Error('One or more selected Confluence spaces are unavailable to your account.');
  }

  const existing = await settingsRepository.get();
  const settings = {
    ...(existing ?? DEFAULT_SETTINGS),
    includedProjectIds,
    includedSpaceIds,
    updatedAt: new Date().toISOString(),
  };

  await settingsRepository.put(settings);
  return {
    schemaVersion: 1 as const,
    includedProjectIds,
    includedSpaceIds,
    updatedAt: settings.updatedAt,
  } satisfies SetupSettings;
});

// --- Candidate Review Inbox Resolvers ---

resolver.define('listCandidates', async ({ payload }) => {
  const filter = (payload ?? {}) as { status?: CandidateStatus; query?: string };
  const page = await candidates.list({ limit: 100 });
  const items = filterCandidates(page.items, {
    status: filter.status,
    query: filter.query,
  });
  return { items, total: items.length, nextCursor: page.nextCursor };
});

resolver.define('confirmCandidate', async ({ payload, context }) => {
  const input = payload as {
    candidateId: string;
    statement?: string;
    rationale?: string;
    scope?: DecisionScope;
  };
  if (!input?.candidateId) throw new Error('Candidate ID is required.');
  const candidate = await candidates.get(input.candidateId);
  if (!candidate) throw new Error(`Candidate "${input.candidateId}" not found.`);

  const actor = await getActorId(context);
  const result = confirmCandidateProposal({
    candidate,
    reviewerId: actor,
    statement: input.statement,
    rationale: input.rationale,
    scope: input.scope,
  });

  await Promise.all([
    decisions.put(result.decision),
    candidates.put(result.updatedCandidate),
    auditLogs.put(result.auditLog),
  ]);

  return { decision: result.decision, candidate: result.updatedCandidate };
});

resolver.define('rejectCandidate', async ({ payload, context }) => {
  const input = payload as { candidateId: string; reason?: string };
  if (!input?.candidateId) throw new Error('Candidate ID is required.');
  const candidate = await candidates.get(input.candidateId);
  if (!candidate) throw new Error(`Candidate "${input.candidateId}" not found.`);

  const actor = await getActorId(context);
  const result = rejectCandidateProposal({
    candidate,
    reviewerId: actor,
    reason: input.reason,
  });

  await Promise.all([
    candidates.put(result.updatedCandidate),
    auditLogs.put(result.auditLog),
  ]);

  return { candidate: result.updatedCandidate };
});

resolver.define('bulkConfirmCandidates', async ({ payload, context }) => {
  const input = payload as { candidateIds: string[] };
  if (!Array.isArray(input?.candidateIds) || input.candidateIds.length === 0) {
    throw new Error('Select candidates to confirm.');
  }
  const actor = await getActorId(context);
  let confirmedCount = 0;

  for (const id of input.candidateIds) {
    const candidate = await candidates.get(id);
    if (candidate && candidate.status === 'pending') {
      const result = confirmCandidateProposal({ candidate, reviewerId: actor });
      await Promise.all([
        decisions.put(result.decision),
        candidates.put(result.updatedCandidate),
        auditLogs.put(result.auditLog),
      ]);
      confirmedCount += 1;
    }
  }

  return { confirmedCount };
});

// --- Decision Registry Resolvers ---

resolver.define('listDecisions', async ({ payload }) => {
  const filter = (payload ?? {}) as {
    status?: DecisionStatus;
    projectId?: string;
    query?: string;
  };
  const page = await decisions.list({ limit: 100 });
  const items = filterDecisions(page.items, filter);
  return { items, total: items.length, nextCursor: page.nextCursor };
});

resolver.define('getDecision', async ({ payload }) => {
  const input = payload as { id: string };
  if (!input?.id) throw new Error('Decision ID is required.');
  const decision = await decisions.get(input.id);
  if (!decision) throw new Error(`Decision "${input.id}" not found.`);
  return decision;
});

// --- Conflict Detection Engine & Issue Panel Resolvers ---

type IssueFieldsResponse = {
  fields?: {
    summary?: string;
    description?: unknown;
    components?: Array<{ name?: string }>;
    labels?: string[];
  };
};

resolver.define('evaluateIssue', async ({ payload, context }) => {
  const issueKey =
    (payload as { issueKey?: string } | undefined)?.issueKey ||
    (context as { extension?: { issue?: { key?: string } } })?.extension?.issue?.key;

  if (!issueKey) throw new Error('Issue key is required to check conflicts.');

  let summary = '';
  let description = '';
  let components: string[] = [];
  let labels: string[] = [];

  try {
    const jiraRes = await api
      .asUser()
      .requestJira(route`/rest/api/3/issue/${issueKey}?fields=summary,description,components,labels`);
    if (jiraRes.ok) {
      const data = (await jiraRes.json()) as IssueFieldsResponse;
      summary = data.fields?.summary ?? '';
      description = extractAdfText(data.fields?.description);
      components = (data.fields?.components ?? [])
        .map((c) => c.name)
        .filter((n): n is string => typeof n === 'string');
      labels = data.fields?.labels ?? [];
    }
  } catch {
    // If running in development/mock environment, provide fallback
    summary = `Issue ${issueKey}`;
  }

  const issueInput: IssueInput = {
    key: issueKey,
    summary,
    description,
    components,
    labels,
  };

  const contentHash = computeIssueContentHash(issueInput);
  const allDecisions = await decisions.list({ limit: 100 });
  const activeDecisions = allDecisions.items.filter((d) => d.status === 'active');

  const candidatesToJudge = retrieveCandidateDecisions(activeDecisions, issueInput, 5);
  const judge = new PatternConflictJudge();

  const conflictItems: Array<{ verdict: Verdict; decision: Decision; resolution?: Resolution }> = [];

  for (const dec of candidatesToJudge) {
    const judgment = await judge.judge(dec, issueInput);
    if (judgment.verdict !== 'no_conflict') {
      const verdictId = `v_${issueKey}_${dec.id}`;
      let verdict = await verdicts.get(verdictId);

      if (!verdict || verdict.issueContentHash !== contentHash) {
        verdict = {
          id: verdictId,
          schemaVersion: CURRENT_SCHEMA_VERSION,
          issueKey,
          decisionId: dec.id,
          verdict: judgment.verdict,
          confidence: judgment.confidence,
          explanation: judgment.explanation,
          triggeringPhrases: judgment.triggeringPhrases,
          issueContentHash: contentHash,
          createdAt: new Date().toISOString(),
          modelVersion: 'pattern-v1',
        };
        await verdicts.put(verdict);
      }

      // Check if resolution exists
      const resolution = await resolutions.get(`res_${verdict.id}`);
      conflictItems.push({ verdict, decision: dec, resolution });
    }
  }

  return {
    issueKey,
    hasConflicts: conflictItems.some((c) => c.verdict.verdict === 'conflict'),
    hasPossibleConflicts: conflictItems.some((c) => c.verdict.verdict === 'possible_conflict'),
    conflicts: conflictItems,
  };
});

resolver.define('resolveConflict', async ({ payload, context }) => {
  const input = payload as {
    verdictId: string;
    action: 'comply' | 'supersede' | 'exception';
    note: string;
    newStatement?: string;
    newRationale?: string;
    exceptionExpiry?: string;
  };

  if (!input?.verdictId) throw new Error('Verdict ID is required.');
  const verdict = await verdicts.get(input.verdictId);
  if (!verdict) throw new Error(`Verdict "${input.verdictId}" not found.`);

  const actor = await getActorId(context);

  if (input.action === 'comply') {
    const { resolution, auditLog } = resolveWithComply(verdict, actor, input.note);
    // Key resolution with res_{verdictId} for deterministic lookup
    resolution.id = `res_${verdict.id}`;
    await Promise.all([resolutions.put(resolution), auditLogs.put(auditLog)]);
    return { resolution };
  }

  if (input.action === 'supersede') {
    if (!input.newStatement) throw new Error('New statement required to supersede decision.');
    const oldDecision = await decisions.get(verdict.decisionId);
    if (!oldDecision) throw new Error(`Prior decision "${verdict.decisionId}" not found.`);

    const result = resolveWithSupersede(
      verdict,
      oldDecision,
      input.newStatement,
      input.newRationale ?? '',
      actor,
    );

    result.resolution.id = `res_${verdict.id}`;

    await Promise.all([
      decisions.put(result.newDecision),
      decisions.put(result.supersededDecision),
      relations.put(result.relation),
      resolutions.put(result.resolution),
      auditLogs.put(result.auditLog),
    ]);

    return { resolution: result.resolution, newDecision: result.newDecision };
  }

  if (input.action === 'exception') {
    const { resolution, auditLog } = resolveWithException(
      verdict,
      actor,
      input.note,
      input.exceptionExpiry ?? '2026-06-01',
    );
    resolution.id = `res_${verdict.id}`;
    await Promise.all([resolutions.put(resolution), auditLogs.put(auditLog)]);
    return { resolution };
  }

  throw new Error(`Unsupported resolution action: ${String(input.action)}`);
});

// --- Stats & Demo Seeding ---

resolver.define('getStats', async () => {
  const [decisionPage, candidatePage] = await Promise.all([
    decisions.list({ limit: 100 }),
    candidates.list({ limit: 100 }),
  ]);

  const activeDecisions = decisionPage.items.filter((d) => d.status === 'active').length;
  const supersededDecisions = decisionPage.items.filter((d) => d.status === 'superseded').length;
  const pendingCandidates = candidatePage.items.filter((c) => c.status === 'pending').length;

  return {
    totalDecisions: decisionPage.items.length,
    activeDecisions,
    supersededDecisions,
    pendingCandidates,
  };
});

resolver.define('seedSampleData', async () => {
  const sampleDecisions = getSampleDecisions();
  const sampleCandidates = getSampleCandidates();

  for (const dec of sampleDecisions) {
    await decisions.put(dec);
  }
  for (const cand of sampleCandidates) {
    await candidates.put(cand);
  }

  return {
    seededDecisions: sampleDecisions.length,
    seededCandidates: sampleCandidates.length,
  };
});

resolver.define('runExtractionScan', async ({ context }) => {
  const settings = await settingsRepository.get();
  const extractor = new HeuristicDecisionExtractor();
  const existingCandidates = await candidates.list({ limit: 100 });
  const proposals: DecisionProposal[] = [];
  let scannedPages = 0;
  let scannedIssues = 0;

  for (const spaceId of settings?.includedSpaceIds ?? []) {
    try {
      const confRes = await api
        .asUser()
        .requestConfluence(route`/wiki/api/v2/pages?space-id=${spaceId}&limit=10&body-format=storage`);
      if (confRes.ok) {
        const pageData = (await confRes.json()) as {
          results?: Array<{
            id: string;
            title: string;
            body?: { storage?: { value?: string } };
            _links?: { webui?: string };
          }>;
        };
        for (const page of pageData.results ?? []) {
          scannedPages += 1;
          const body = page.body?.storage?.value ?? '';
          const extracted = await extractor.extract(body, {
            type: 'page',
            id: String(page.id),
            url: page._links?.webui ?? `https://confluence.example.com/pages/${page.id}`,
            spaceKey: spaceId,
          });
          proposals.push(...extracted);
        }
      }
    } catch {
      // safe partial failure
    }
  }

  for (const projectId of settings?.includedProjectIds ?? []) {
    try {
      const jiraRes = await api
        .asUser()
        .requestJira(
          route`/rest/api/3/search?jql=project=${projectId} order by updated desc&maxResults=10&fields=summary,description,comment`,
        );
      if (jiraRes.ok) {
        const jiraData = (await jiraRes.json()) as {
          issues?: Array<{
            id: string;
            key: string;
            fields?: {
              summary?: string;
              description?: unknown;
              comment?: { comments?: Array<{ id: string; body?: unknown }> };
            };
          }>;
        };
        for (const issue of jiraData.issues ?? []) {
          scannedIssues += 1;
          const desc = extractAdfText(issue.fields?.description);
          if (desc) {
            const extracted = await extractor.extract(desc, {
              type: 'comment',
              id: issue.key,
              url: `https://jira.example.com/browse/${issue.key}`,
              projectId,
            });
            proposals.push(...extracted);
          }
          for (const comm of issue.fields?.comment?.comments ?? []) {
            const commText = extractAdfText(comm.body);
            if (commText) {
              const extracted = await extractor.extract(commText, {
                type: 'comment',
                id: `${issue.key}#${comm.id}`,
                url: `https://jira.example.com/browse/${issue.key}#comment-${comm.id}`,
                projectId,
              });
              proposals.push(...extracted);
            }
          }
        }
      }
    } catch {
      // safe partial failure
    }
  }

  const newCandidates = buildIdempotentCandidates(proposals, existingCandidates.items);
  for (const cand of newCandidates) {
    await candidates.put(cand);
  }

  const actor = await getActorId(context);
  if (newCandidates.length > 0) {
    await auditLogs.put({
      id: `audit_scan_${Date.now().toString(36)}`,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      actor,
      action: 'run_extraction_scan',
      targetType: 'candidate',
      targetId: 'batch',
      after: {
        scannedPages,
        scannedIssues,
        newCandidatesCount: newCandidates.length,
      },
      timestamp: new Date().toISOString(),
    });
  }

  return {
    scannedPages,
    scannedIssues,
    newCandidatesCount: newCandidates.length,
  };
});

export const handler = resolver.getDefinitions();
