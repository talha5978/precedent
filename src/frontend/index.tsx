import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Box, Heading, Inline, Lozenge, Stack, Text } from '@forge/react';
import { invoke } from '@forge/bridge';

type Overview = {
  productName: string;
  tagline: string;
  status: string;
};

function App() {
  const [overview, setOverview] = useState<Overview | null>(null);

  useEffect(() => {
    invoke<Overview>('getOverview').then(setOverview);
  }, []);

  return (
    <Box padding="space.300">
      <Stack space="space.200">
        <Inline space="space.100" alignBlock="center">
          <Heading as="h1">{overview?.productName ?? 'Precedent'}</Heading>
          <Lozenge appearance="inprogress">Early access</Lozenge>
        </Inline>
        <Text>{overview?.tagline ?? 'Loading your decision workspace…'}</Text>
        <Text>
          Precedent will turn decisions from Jira and Confluence into a sourced registry and surface
          conflicts while work is being planned.
        </Text>
        <Text>
          The next milestone is first-run setup: choose the projects and spaces Precedent may scan,
          then review extracted decisions before they become active.
        </Text>
      </Stack>
    </Box>
  );
}

ForgeReconciler.render(<App />);
