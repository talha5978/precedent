import api, { route } from '@forge/api';
import Resolver from '@forge/resolver';
import { settingsRepository } from './storage/repositories';
import {
  type ProjectOption,
  type SetupOptions,
  type SetupSettings,
  type SpaceOption,
} from './domain/setup';

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

export const handler = resolver.getDefinitions();
