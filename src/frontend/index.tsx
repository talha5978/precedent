import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  Heading,
  Inline,
  Label,
  Lozenge,
  Select,
  Stack,
  Text,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { toSetupOption, type SetupOptions, type SetupSettings } from '../domain/setup';

type SetupResponse = {
  options: SetupOptions;
  settings?: SetupSettings;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

function App() {
  const [setup, setSetup] = useState<SetupResponse | null>(null);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [spaceIds, setSpaceIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function loadSetup() {
    setLoading(true);
    setError(null);
    try {
      const response = await invoke<SetupResponse>('getSetup');
      setSetup(response);
      setProjectIds(response.settings?.includedProjectIds ?? []);
      setSpaceIds(response.settings?.includedSpaceIds ?? []);
      setSaved(Boolean(response.settings));
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSetup();
  }, []);

  async function saveSetup() {
    if (!setup) return;
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      await invoke<SetupSettings>('saveSetup', {
        includedProjectIds: projectIds,
        includedSpaceIds: spaceIds,
      });
      setSaved(true);
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Box padding="space.300">
        <Text>Loading your setup options…</Text>
      </Box>
    );
  }

  if (!setup) {
    return (
      <Box padding="space.300">
        <Stack space="space.200">
          <Heading as="h1">Set up Precedent</Heading>
          <Text>{error ?? 'Setup options could not be loaded.'}</Text>
          <Button appearance="primary" onClick={() => void loadSetup()}>
            Try again
          </Button>
        </Stack>
      </Box>
    );
  }

  const projectOptions = setup.options.projects.map(toSetupOption);
  const spaceOptions = setup.options.spaces.map(toSetupOption);

  return (
    <Box padding="space.300">
      <Stack space="space.300">
        <Stack space="space.100">
          <Inline space="space.100" alignBlock="center">
            <Heading as="h1">Set up Precedent</Heading>
            <Lozenge appearance={saved ? 'success' : 'inprogress'}>
              {saved ? 'Setup saved' : 'First run'}
            </Lozenge>
          </Inline>
          <Text>
            Choose the Jira projects and Confluence spaces Precedent may include in its decision
            registry. You can change this scope later.
          </Text>
        </Stack>

        {setup.options.warnings.map((warning) => (
          <Text key={warning}>{warning}</Text>
        ))}

        <Stack space="space.100">
          <Label labelFor="projects">Jira projects</Label>
          <Select
            id="projects"
            isMulti
            isDisabled={saving}
            options={projectOptions}
            value={projectOptions.filter(({ value }) => projectIds.includes(value))}
            onChange={(value) =>
              setProjectIds(
                (Array.isArray(value) ? value : value ? [value] : []).map(({ value: id }) => id),
              )
            }
            placeholder="Select projects"
          />
          {setup.options.projects.length === 0 && (
            <Text>No Jira projects are available to your account.</Text>
          )}
        </Stack>

        <Stack space="space.100">
          <Label labelFor="spaces">Confluence spaces</Label>
          <Select
            id="spaces"
            isMulti
            isDisabled={saving}
            options={spaceOptions}
            value={spaceOptions.filter(({ value }) => spaceIds.includes(value))}
            onChange={(value) =>
              setSpaceIds(
                (Array.isArray(value) ? value : value ? [value] : []).map(({ value: id }) => id),
              )
            }
            placeholder="Select spaces"
          />
          {setup.options.spaces.length === 0 && (
            <Text>No Confluence spaces are available to your account.</Text>
          )}
        </Stack>

        {error && <Text>{error}</Text>}
        {saved && <Text>Your project and space selections are saved.</Text>}

        <Inline space="space.200">
          <Button appearance="primary" isDisabled={saving} onClick={() => void saveSetup()}>
            {saving ? 'Saving…' : 'Save setup'}
          </Button>
          <Button isDisabled={saving} onClick={() => void loadSetup()}>
            Reload options
          </Button>
        </Inline>
        <Text>Only a Jira site administrator can save these settings.</Text>
      </Stack>
    </Box>
  );
}

ForgeReconciler.render(<App />);
