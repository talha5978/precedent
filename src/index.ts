import api, { route } from '@forge/api';
import Resolver from '@forge/resolver';
import { auditLogs, candidates, decisions, settingsRepository } from './storage/repositories';
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
  type CandidateStatus,
  type DecisionScope,
  type DecisionStatus,
} from './domain/models';
import { getSampleCandidates, getSampleDecisions } from './domain/sampleData';

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

export const handler = resolver.getDefinitions();
