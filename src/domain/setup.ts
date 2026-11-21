export type ProjectOption = {
  id: string;
  key: string;
  name: string;
};

export type SpaceOption = {
  id: string;
  key: string;
  name: string;
};

export type SetupSettings = {
  schemaVersion: 1;
  includedProjectIds: string[];
  includedSpaceIds: string[];
  updatedAt: string;
};

export type SetupOptions = {
  projects: ProjectOption[];
  spaces: SpaceOption[];
  warnings: string[];
};

export type SetupOption = {
  label: string;
  value: string;
};

export function toSetupOption(item: { id: string; key: string; name: string }): SetupOption {
  return { label: `${item.name} (${item.key})`, value: item.id };
}

export function parseSetupSettings(value: unknown): SetupSettings | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const candidate = value as Partial<SetupSettings>;
  if (
    candidate.schemaVersion !== 1 ||
    !Array.isArray(candidate.includedProjectIds) ||
    !Array.isArray(candidate.includedSpaceIds) ||
    typeof candidate.updatedAt !== 'string'
  ) {
    return undefined;
  }
  if (
    !candidate.includedProjectIds.every((id) => typeof id === 'string') ||
    !candidate.includedSpaceIds.every((id) => typeof id === 'string')
  ) {
    return undefined;
  }

  return candidate as SetupSettings;
}
