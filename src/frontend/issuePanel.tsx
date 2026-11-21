import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  Heading,
  Inline,
  Label,
  Lozenge,
  Spinner,
  Stack,
  Strong,
  Text,
  TextArea,
  Textfield,
  useProductContext,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import type { Decision, Resolution, Verdict } from '../domain/models';

type ConflictItem = {
  verdict: Verdict;
  decision: Decision;
  resolution?: Resolution;
};

type EvaluationResponse = {
  issueKey: string;
  hasConflicts: boolean;
  hasPossibleConflicts: boolean;
  conflicts: ConflictItem[];
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Failed to evaluate issue against decisions.';
}

function IssuePanel() {
  const context = useProductContext();
  const issueKey = (context as { extension?: { issue?: { key?: string } } })?.extension?.issue?.key;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<EvaluationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Active resolution action dialog
  const [resolvingVerdictId, setResolvingVerdictId] = useState<string | null>(null);
  const [resolutionAction, setResolutionAction] = useState<'comply' | 'supersede' | 'exception' | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [newStatement, setNewStatement] = useState('');
  const [newRationale, setNewRationale] = useState('');
  const [exceptionExpiry, setExceptionExpiry] = useState('2026-06-01');
  const [submittingResolution, setSubmittingResolution] = useState(false);

  async function checkConflicts(targetKey: string) {
    setLoading(true);
    setError(null);
    try {
      const response = await invoke<EvaluationResponse>('evaluateIssue', { issueKey: targetKey });
      setData(response);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (issueKey) {
      void checkConflicts(issueKey);
    }
  }, [issueKey]);

  async function handleResolve(verdictId: string) {
    if (!resolutionAction) return;
    setSubmittingResolution(true);
    setError(null);

    try {
      await invoke('resolveConflict', {
        verdictId,
        action: resolutionAction,
        note: resolutionNote,
        newStatement: resolutionAction === 'supersede' ? newStatement : undefined,
        newRationale: resolutionAction === 'supersede' ? newRationale : undefined,
        exceptionExpiry: resolutionAction === 'exception' ? exceptionExpiry : undefined,
      });

      setResolvingVerdictId(null);
      setResolutionAction(null);
      setResolutionNote('');
      setNewStatement('');
      setNewRationale('');

      if (issueKey) {
        await checkConflicts(issueKey);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmittingResolution(false);
    }
  }

  if (loading) {
    return (
      <Box padding="space.150">
        <Inline space="space.100" alignBlock="center">
          <Spinner size="small" />
          <Text>Checking active decisions…</Text>
        </Inline>
      </Box>
    );
  }

  if (error) {
    return (
      <Box padding="space.150" backgroundColor="color.background.danger">
        <Text>{error}</Text>
        <Button appearance="subtle" onClick={() => issueKey && void checkConflicts(issueKey)}>
          Retry
        </Button>
      </Box>
    );
  }

  if (!data || data.conflicts.length === 0) {
    return (
      <Box padding="space.150">
        <Inline space="space.100" alignBlock="center">
          <Lozenge appearance="success">All Clear</Lozenge>
          <Text>No conflicts detected with active team decisions.</Text>
        </Inline>
      </Box>
    );
  }

  return (
    <Box padding="space.150">
      <Stack space="space.200">
        {/* Banner Alert */}
        <Inline space="space.100" alignBlock="center" spread="space-between">
          <Inline space="space.100" alignBlock="center">
            <Lozenge appearance={data.hasConflicts ? 'removed' : 'inprogress'}>
              {data.hasConflicts ? 'Contradiction Detected' : 'Potential Conflict'}
            </Lozenge>
            <Text>{data.conflicts.length} governing decision(s) flagged</Text>
          </Inline>
          <Button appearance="subtle" onClick={() => issueKey && void checkConflicts(issueKey)}>
            Re-evaluate
          </Button>
        </Inline>

        {/* Conflicts List */}
        {data.conflicts.map(({ verdict, decision, resolution }) => {
          const isResolving = resolvingVerdictId === verdict.id;

          return (
            <Box
              key={verdict.id}
              padding="space.150"
              backgroundColor="color.background.neutral.subtle"
            >
              <Stack space="space.150">
                <Inline space="space.100" alignBlock="center" spread="space-between">
                  <Heading as="h4">{decision.statement}</Heading>
                  <Lozenge appearance={verdict.verdict === 'conflict' ? 'removed' : 'inprogress'}>
                    {Math.round(verdict.confidence * 100)}% match
                  </Lozenge>
                </Inline>

                <Text>
                  <Strong>Why flagged:</Strong> {verdict.explanation}
                </Text>

                {verdict.triggeringPhrases.length > 0 && (
                  <Text>
                    <Strong>Triggering text:</Strong> “{verdict.triggeringPhrases.join('”, “')}”
                  </Text>
                )}

                <Box padding="space.075" backgroundColor="color.background.neutral">
                  <Text>
                    <Strong>Prior rationale:</Strong> {decision.rationale} (Source: {decision.source.type})
                  </Text>
                </Box>

                {/* Already Resolved State */}
                {resolution ? (
                  <Box padding="space.100" backgroundColor="color.background.accent.green.subtlest">
                    <Inline space="space.050" alignBlock="center">
                      <Lozenge appearance="success">Resolved: {resolution.action}</Lozenge>
                      <Text>by {resolution.actor}: “{resolution.note}”</Text>
                    </Inline>
                  </Box>
                ) : isResolving ? (
                  /* Inline Resolution Workflow */
                  <Box padding="space.150" backgroundColor="color.background.neutral.subtle">
                    <Stack space="space.150">
                      <Heading as="h4">Resolve Decision Conflict</Heading>

                      {/* Comply details */}
                      {resolutionAction === 'comply' && (
                        <Stack space="space.050">
                          <Label labelFor="complyNote">Compliance note (how the plan is adjusted)</Label>
                          <Textfield
                            id="complyNote"
                            value={resolutionNote}
                            placeholder="e.g. Plan updated to use PostgreSQL 16"
                            onChange={(e) => setResolutionNote((e.target as HTMLInputElement).value)}
                          />
                        </Stack>
                      )}

                      {/* Supersede details */}
                      {resolutionAction === 'supersede' && (
                        <Stack space="space.100">
                          <Stack space="space.050">
                            <Label labelFor="supStatement">New Decision Statement</Label>
                            <Textfield
                              id="supStatement"
                              value={newStatement}
                              placeholder="New binding decision statement"
                              onChange={(e) => setNewStatement((e.target as HTMLInputElement).value)}
                            />
                          </Stack>
                          <Stack space="space.050">
                            <Label labelFor="supRationale">Rationale for replacing prior decision</Label>
                            <TextArea
                              id="supRationale"
                              value={newRationale}
                              placeholder="Why the previous decision is being superseded"
                              onChange={(e) => setNewRationale((e.target as HTMLTextAreaElement).value)}
                            />
                          </Stack>
                        </Stack>
                      )}

                      {/* Exception details */}
                      {resolutionAction === 'exception' && (
                        <Stack space="space.100">
                          <Stack space="space.050">
                            <Label labelFor="excNote">Justification for exception</Label>
                            <Textfield
                              id="excNote"
                              value={resolutionNote}
                              placeholder="Business / technical justification for temporary waiver"
                              onChange={(e) => setResolutionNote((e.target as HTMLInputElement).value)}
                            />
                          </Stack>
                          <Stack space="space.050">
                            <Label labelFor="excDate">Expiry date (YYYY-MM-DD)</Label>
                            <Textfield
                              id="excDate"
                              value={exceptionExpiry}
                              onChange={(e) => setExceptionExpiry((e.target as HTMLInputElement).value)}
                            />
                          </Stack>
                        </Stack>
                      )}

                      <Inline space="space.100">
                        <Button
                          appearance="primary"
                          isDisabled={submittingResolution}
                          onClick={() => void handleResolve(verdict.id)}
                        >
                          {submittingResolution ? 'Submitting…' : 'Submit resolution'}
                        </Button>
                        <Button
                          appearance="subtle"
                          onClick={() => {
                            setResolvingVerdictId(null);
                            setResolutionAction(null);
                          }}
                        >
                          Cancel
                        </Button>
                      </Inline>
                    </Stack>
                  </Box>
                ) : (
                  /* Action Buttons */
                  <Inline space="space.100">
                    <Button
                      onClick={() => {
                        setResolvingVerdictId(verdict.id);
                        setResolutionAction('comply');
                        setResolutionNote('Adjusted plan to comply with decision');
                      }}
                    >
                      Comply
                    </Button>
                    <Button
                      onClick={() => {
                        setResolvingVerdictId(verdict.id);
                        setResolutionAction('supersede');
                        setNewStatement(`Superseding: ${decision.statement}`);
                      }}
                    >
                      Supersede
                    </Button>
                    <Button
                      appearance="subtle"
                      onClick={() => {
                        setResolvingVerdictId(verdict.id);
                        setResolutionAction('exception');
                        setResolutionNote('');
                      }}
                    >
                      Request Exception
                    </Button>
                  </Inline>
                )}
              </Stack>
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}

ForgeReconciler.render(<IssuePanel />);
