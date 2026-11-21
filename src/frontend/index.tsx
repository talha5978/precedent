import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Badge,
  Box,
  Button,
  Heading,
  Inline,
  Label,
  Lozenge,
  Select,
  Stack,
  Tag,
  TagGroup,
  Text,
  TextArea,
  Textfield,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { toSetupOption, type SetupOptions, type SetupSettings } from '../domain/setup';
import type { Candidate, Decision, DecisionStatus } from '../domain/models';

type TabKey = 'registry' | 'inbox' | 'setup';

type StatsResponse = {
  totalDecisions: number;
  activeDecisions: number;
  supersededDecisions: number;
  pendingCandidates: number;
};

type SetupResponse = {
  options: SetupOptions;
  settings?: SetupSettings;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('registry');
  const [stats, setStats] = useState<StatsResponse>({
    totalDecisions: 0,
    activeDecisions: 0,
    supersededDecisions: 0,
    pendingCandidates: 0,
  });

  // Registry state
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [selectedDecision, setSelectedDecision] = useState<Decision | null>(null);
  const [registryQuery, setRegistryQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loadingDecisions, setLoadingDecisions] = useState(false);

  // Review Inbox state
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null);
  const [editStatement, setEditStatement] = useState('');
  const [editRationale, setEditRationale] = useState('');
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Setup state
  const [setup, setSetup] = useState<SetupResponse | null>(null);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [spaceIds, setSpaceIds] = useState<string[]>([]);
  const [savingSetup, setSavingSetup] = useState(false);
  const [setupSaved, setSetupSaved] = useState(false);

  // Global status/messages
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  async function refreshStats() {
    try {
      const data = await invoke<StatsResponse>('getStats');
      setStats(data);
    } catch {
      // stats refresh silent error
    }
  }

  async function loadDecisions() {
    setLoadingDecisions(true);
    setGlobalError(null);
    try {
      const payload: { status?: DecisionStatus; query?: string } = {};
      if (statusFilter !== 'all') payload.status = statusFilter as DecisionStatus;
      if (registryQuery.trim()) payload.query = registryQuery.trim();

      const response = await invoke<{ items: Decision[] }>('listDecisions', payload);
      setDecisions(response.items);
    } catch (err) {
      setGlobalError(errorMessage(err));
    } finally {
      setLoadingDecisions(false);
    }
  }

  async function loadCandidates() {
    setLoadingCandidates(true);
    setGlobalError(null);
    try {
      const response = await invoke<{ items: Candidate[] }>('listCandidates', { status: 'pending' });
      setCandidates(response.items);
    } catch (err) {
      setGlobalError(errorMessage(err));
    } finally {
      setLoadingCandidates(false);
    }
  }

  async function loadSetup() {
    try {
      const response = await invoke<SetupResponse>('getSetup');
      setSetup(response);
      setProjectIds(response.settings?.includedProjectIds ?? []);
      setSpaceIds(response.settings?.includedSpaceIds ?? []);
      setSetupSaved(Boolean(response.settings));
    } catch (err) {
      setGlobalError(errorMessage(err));
    }
  }

  useEffect(() => {
    void refreshStats();
    void loadDecisions();
    void loadCandidates();
    void loadSetup();
  }, []);

  useEffect(() => {
    if (activeTab === 'registry') {
      void loadDecisions();
    } else if (activeTab === 'inbox') {
      void loadCandidates();
    }
    void refreshStats();
  }, [activeTab, statusFilter]);

  async function handleConfirmCandidate(cand: Candidate, customStatement?: string, customRationale?: string) {
    setActionInProgress(cand.id);
    setGlobalError(null);
    try {
      await invoke('confirmCandidate', {
        candidateId: cand.id,
        statement: customStatement ?? cand.proposal.statement,
        rationale: customRationale ?? cand.proposal.rationale,
      });
      setBannerMessage(`Confirmed decision: "${customStatement ?? cand.proposal.statement}"`);
      setEditingCandidate(null);
      await Promise.all([loadCandidates(), loadDecisions(), refreshStats()]);
    } catch (err) {
      setGlobalError(errorMessage(err));
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleRejectCandidate(cand: Candidate) {
    setActionInProgress(cand.id);
    setGlobalError(null);
    try {
      await invoke('rejectCandidate', { candidateId: cand.id });
      setBannerMessage(`Rejected proposal.`);
      await Promise.all([loadCandidates(), refreshStats()]);
    } catch (err) {
      setGlobalError(errorMessage(err));
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleBulkConfirmAll() {
    const pendingIds = candidates.map((c) => c.id);
    if (pendingIds.length === 0) return;
    setActionInProgress('bulk');
    setGlobalError(null);
    try {
      const res = await invoke<{ confirmedCount: number }>('bulkConfirmCandidates', {
        candidateIds: pendingIds,
      });
      setBannerMessage(`Bulk-confirmed ${res.confirmedCount} decision(s).`);
      await Promise.all([loadCandidates(), loadDecisions(), refreshStats()]);
    } catch (err) {
      setGlobalError(errorMessage(err));
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleSeedDemoData() {
    setActionInProgress('seed');
    setGlobalError(null);
    try {
      const res = await invoke<{ seededDecisions: number; seededCandidates: number }>('seedSampleData');
      setBannerMessage(
        `Seeded ${res.seededDecisions} realistic decisions and ${res.seededCandidates} inbox candidates.`,
      );
      await Promise.all([loadDecisions(), loadCandidates(), refreshStats()]);
    } catch (err) {
      setGlobalError(errorMessage(err));
    } finally {
      setActionInProgress(null);
    }
  }

  async function saveSetup() {
    if (!setup) return;
    setSavingSetup(true);
    setGlobalError(null);
    setSetupSaved(false);

    try {
      await invoke<SetupSettings>('saveSetup', {
        includedProjectIds: projectIds,
        includedSpaceIds: spaceIds,
      });
      setSetupSaved(true);
      setBannerMessage('Scope preferences saved successfully.');
    } catch (err) {
      setGlobalError(errorMessage(err));
    } finally {
      setSavingSetup(false);
    }
  }

  return (
    <Box padding="space.300">
      <Stack space="space.300">
        {/* Header and Stats */}
        <Stack space="space.150">
          <Inline space="space.200" alignBlock="center" spread="space-between">
            <Stack space="space.050">
              <Heading as="h1">Precedent</Heading>
              <Text>Living organizational memory & decision contradiction prevention</Text>
            </Stack>
            <Inline space="space.100" alignBlock="center">
              <Button
                appearance="subtle"
                isDisabled={actionInProgress === 'seed'}
                onClick={() => void handleSeedDemoData()}
              >
                {actionInProgress === 'seed' ? 'Seeding…' : 'Seed demo data'}
              </Button>
            </Inline>
          </Inline>

          {/* Quick Metrics */}
          <Inline space="space.200">
            <Inline space="space.050" alignBlock="center">
              <Text>Active Decisions:</Text>
              <Badge appearance="added">{stats.activeDecisions}</Badge>
            </Inline>
            <Inline space="space.050" alignBlock="center">
              <Text>Pending Review:</Text>
              <Badge appearance="important">{stats.pendingCandidates}</Badge>
            </Inline>
            <Inline space="space.050" alignBlock="center">
              <Text>Superseded:</Text>
              <Badge>{stats.supersededDecisions}</Badge>
            </Inline>
          </Inline>
        </Stack>

        {bannerMessage && (
          <Box padding="space.150" backgroundColor="color.background.accent.green.subtlest">
            <Inline space="space.100" alignBlock="center" spread="space-between">
              <Text>{bannerMessage}</Text>
              <Button appearance="subtle" onClick={() => setBannerMessage(null)}>
                Dismiss
              </Button>
            </Inline>
          </Box>
        )}

        {globalError && (
          <Box padding="space.150" backgroundColor="color.background.danger">
            <Text>{globalError}</Text>
          </Box>
        )}

        {/* Navigation Tabs */}
        <Inline space="space.100">
          <Button
            appearance={activeTab === 'registry' ? 'primary' : 'subtle'}
            onClick={() => {
              setActiveTab('registry');
              setSelectedDecision(null);
            }}
          >
            Decision Registry ({stats.totalDecisions})
          </Button>
          <Button
            appearance={activeTab === 'inbox' ? 'primary' : 'subtle'}
            onClick={() => {
              setActiveTab('inbox');
              setEditingCandidate(null);
            }}
          >
            Review Inbox ({stats.pendingCandidates})
          </Button>
          <Button
            appearance={activeTab === 'setup' ? 'primary' : 'subtle'}
            onClick={() => setActiveTab('setup')}
          >
            Scope & Setup
          </Button>
        </Inline>

        {/* TAB 1: DECISION REGISTRY */}
        {activeTab === 'registry' && (
          <Stack space="space.250">
            {/* Search and Filters */}
            <Inline space="space.150" alignBlock="center">
              <Box xcss={{ minWidth: '250px' }}>
                <Textfield
                  placeholder="Filter by keyword or rationale…"
                  value={registryQuery}
                  onChange={(e) => setRegistryQuery((e.target as HTMLInputElement).value)}
                />
              </Box>
              <Button onClick={() => void loadDecisions()} isDisabled={loadingDecisions}>
                {loadingDecisions ? 'Searching…' : 'Search'}
              </Button>
              <Select
                id="statusFilter"
                options={[
                  { label: 'All statuses', value: 'all' },
                  { label: 'Active', value: 'active' },
                  { label: 'Superseded', value: 'superseded' },
                  { label: 'Under Review', value: 'under_review' },
                ]}
                value={{
                  label: statusFilter === 'all' ? 'All statuses' : statusFilter,
                  value: statusFilter,
                }}
                onChange={(option) => {
                  const val = Array.isArray(option) ? option[0]?.value : option?.value;
                  setStatusFilter(val ?? 'all');
                }}
              />
            </Inline>

            {/* Selected Decision Detail View */}
            {selectedDecision && (
              <Box padding="space.200" backgroundColor="color.background.discovery">
                <Stack space="space.150">
                  <Inline space="space.100" alignBlock="center" spread="space-between">
                    <Heading as="h2">{selectedDecision.statement}</Heading>
                    <Button appearance="subtle" onClick={() => setSelectedDecision(null)}>
                      Close Detail
                    </Button>
                  </Inline>
                  <Inline space="space.100">
                    <Lozenge appearance={selectedDecision.status === 'active' ? 'success' : 'default'}>
                      {selectedDecision.status}
                    </Lozenge>
                    <Text>
                      Confirmed by {selectedDecision.confirmedBy} on {formatDate(selectedDecision.confirmedAt)}
                    </Text>
                  </Inline>
                  <Stack space="space.050">
                    <Text>
                      <strong>Rationale:</strong> {selectedDecision.rationale}
                    </Text>
                    {selectedDecision.owner && (
                      <Text>
                        <strong>Owner:</strong> {selectedDecision.owner}
                      </Text>
                    )}
                  </Stack>

                  <Box padding="space.100" backgroundColor="color.background.neutral">
                    <Stack space="space.050">
                      <Text>
                        <strong>Source ({selectedDecision.source.type}):</strong> {selectedDecision.source.url}
                      </Text>
                      <Text>“{selectedDecision.source.quotedExcerpt}”</Text>
                    </Stack>
                  </Box>

                  {selectedDecision.scope.keywords.length > 0 && (
                    <Stack space="space.050">
                      <Text>
                        <strong>Governed Keywords & Components:</strong>
                      </Text>
                      <TagGroup>
                        {selectedDecision.scope.keywords.map((kw) => (
                          <Tag key={kw} text={kw} />
                        ))}
                        {selectedDecision.scope.components.map((comp) => (
                          <Tag key={comp} text={`component:${comp}`} />
                        ))}
                      </TagGroup>
                    </Stack>
                  )}
                </Stack>
              </Box>
            )}

            {/* Decision Cards */}
            {decisions.length === 0 ? (
              <Box padding="space.300">
                <Stack space="space.100">
                  <Text>No decisions found matching your filter criteria.</Text>
                  <Text>
                    Confirm proposals in the Review Inbox, or click "Seed demo data" above to populate sample
                    decisions.
                  </Text>
                </Stack>
              </Box>
            ) : (
              <Stack space="space.150">
                {decisions.map((dec) => (
                  <Box
                    key={dec.id}
                    padding="space.200"
                    backgroundColor="color.background.neutral.subtle"
                  >
                    <Stack space="space.100">
                      <Inline space="space.100" alignBlock="center" spread="space-between">
                        <Inline space="space.100" alignBlock="center">
                          <Lozenge appearance={dec.status === 'active' ? 'success' : 'default'}>
                            {dec.status}
                          </Lozenge>
                          <Heading as="h3">{dec.statement}</Heading>
                        </Inline>
                        <Button appearance="subtle" onClick={() => setSelectedDecision(dec)}>
                          View full details
                        </Button>
                      </Inline>
                      <Text>{dec.rationale}</Text>
                      <Inline space="space.200" alignBlock="center">
                        <Text>Source: {dec.source.type}</Text>
                        <Text>Confirmed: {formatDate(dec.confirmedAt)}</Text>
                        {dec.scope.keywords.length > 0 && (
                          <Text>Keywords: {dec.scope.keywords.slice(0, 3).join(', ')}</Text>
                        )}
                      </Inline>
                    </Stack>
                  </Box>
                ))}
              </Stack>
            )}
          </Stack>
        )}

        {/* TAB 2: REVIEW INBOX */}
        {activeTab === 'inbox' && (
          <Stack space="space.250">
            <Inline space="space.100" alignBlock="center" spread="space-between">
              <Stack space="space.050">
                <Heading as="h2">Review Inbox (Human Confirmation)</Heading>
                <Text>
                  Decisions extracted by AI from meeting notes, pages, and tickets. Confirm to enforce.
                </Text>
              </Stack>
              {candidates.length > 0 && (
                <Button
                  appearance="primary"
                  isDisabled={actionInProgress !== null}
                  onClick={() => void handleBulkConfirmAll()}
                >
                  {actionInProgress === 'bulk' ? 'Confirming…' : `Confirm all (${candidates.length})`}
                </Button>
              )}
            </Inline>

            {/* Inline Editor if reviewing/editing a candidate */}
            {editingCandidate && (
              <Box padding="space.200" backgroundColor="color.background.discovery">
                <Stack space="space.150">
                  <Heading as="h3">Edit Candidate before Confirming</Heading>
                  <Stack space="space.050">
                    <Label labelFor="editStatement">Decision Statement</Label>
                    <Textfield
                      id="editStatement"
                      value={editStatement}
                      onChange={(e) => setEditStatement((e.target as HTMLInputElement).value)}
                    />
                  </Stack>
                  <Stack space="space.050">
                    <Label labelFor="editRationale">Rationale</Label>
                    <TextArea
                      id="editRationale"
                      value={editRationale}
                      onChange={(e) => setEditRationale((e.target as HTMLTextAreaElement).value)}
                    />
                  </Stack>
                  <Inline space="space.100">
                    <Button
                      appearance="primary"
                      isDisabled={actionInProgress !== null}
                      onClick={() => void handleConfirmCandidate(editingCandidate, editStatement, editRationale)}
                    >
                      Save & Confirm Decision
                    </Button>
                    <Button appearance="subtle" onClick={() => setEditingCandidate(null)}>
                      Cancel
                    </Button>
                  </Inline>
                </Stack>
              </Box>
            )}

            {candidates.length === 0 ? (
              <Box padding="space.300">
                <Stack space="space.100">
                  <Text>The inbox is all caught up! No candidate decisions pending review.</Text>
                  <Text>
                    New candidates appear automatically as pages and comments are created in your selected
                    spaces.
                  </Text>
                </Stack>
              </Box>
            ) : (
              <Stack space="space.200">
                {candidates.map((cand) => (
                  <Box
                    key={cand.id}
                    padding="space.200"
                    backgroundColor="color.background.neutral.subtle"
                  >
                    <Stack space="space.150">
                      <Inline space="space.100" alignBlock="center" spread="space-between">
                        <Heading as="h3">{cand.proposal.statement}</Heading>
                        <Lozenge
                          appearance={cand.proposal.confidence >= 0.9 ? 'success' : 'inprogress'}
                        >
                          {Math.round(cand.proposal.confidence * 100)}% confidence
                        </Lozenge>
                      </Inline>

                      <Text>
                        <strong>Rationale:</strong> {cand.proposal.rationale}
                      </Text>

                      <Box padding="space.100" backgroundColor="color.background.neutral">
                        <Stack space="space.050">
                          <Text>
                            <strong>Extracted from {cand.proposal.source.type}:</strong>{' '}
                            {cand.proposal.source.url}
                          </Text>
                          <Text>“{cand.proposal.source.quotedExcerpt}”</Text>
                        </Stack>
                      </Box>

                      {cand.proposal.scope.keywords.length > 0 && (
                        <Inline space="space.050" alignBlock="center">
                          <Text>Keywords:</Text>
                          <TagGroup>
                            {cand.proposal.scope.keywords.map((kw) => (
                              <Tag key={kw} text={kw} />
                            ))}
                          </TagGroup>
                        </Inline>
                      )}

                      <Inline space="space.100">
                        <Button
                          appearance="primary"
                          isDisabled={actionInProgress !== null}
                          onClick={() => void handleConfirmCandidate(cand)}
                        >
                          Confirm
                        </Button>
                        <Button
                          isDisabled={actionInProgress !== null}
                          onClick={() => {
                            setEditingCandidate(cand);
                            setEditStatement(cand.proposal.statement);
                            setEditRationale(cand.proposal.rationale);
                          }}
                        >
                          Edit & Confirm
                        </Button>
                        <Button
                          appearance="subtle"
                          isDisabled={actionInProgress !== null}
                          onClick={() => void handleRejectCandidate(cand)}
                        >
                          Reject
                        </Button>
                      </Inline>
                    </Stack>
                  </Box>
                ))}
              </Stack>
            )}
          </Stack>
        )}

        {/* TAB 3: SCOPE & SETUP */}
        {activeTab === 'setup' && (
          <Stack space="space.250">
            <Stack space="space.100">
              <Heading as="h2">Project & Space Scope</Heading>
              <Text>
                Choose which Jira projects and Confluence spaces Precedent monitors for decisions and
                conflict detection.
              </Text>
            </Stack>

            {setup ? (
              <Stack space="space.200">
                {setup.options.warnings.map((w) => (
                  <Text key={w}>{w}</Text>
                ))}

                <Stack space="space.100">
                  <Label labelFor="jiraProjects">Jira projects</Label>
                  <Select
                    id="jiraProjects"
                    isMulti
                    isDisabled={savingSetup}
                    options={setup.options.projects.map(toSetupOption)}
                    value={setup.options.projects
                      .map(toSetupOption)
                      .filter(({ value }) => projectIds.includes(value))}
                    onChange={(value) =>
                      setProjectIds(
                        (Array.isArray(value) ? value : value ? [value] : []).map(
                          ({ value: id }) => id,
                        ),
                      )
                    }
                    placeholder="Select Jira projects"
                  />
                </Stack>

                <Stack space="space.100">
                  <Label labelFor="confluenceSpaces">Confluence spaces</Label>
                  <Select
                    id="confluenceSpaces"
                    isMulti
                    isDisabled={savingSetup}
                    options={setup.options.spaces.map(toSetupOption)}
                    value={setup.options.spaces
                      .map(toSetupOption)
                      .filter(({ value }) => spaceIds.includes(value))}
                    onChange={(value) =>
                      setSpaceIds(
                        (Array.isArray(value) ? value : value ? [value] : []).map(
                          ({ value: id }) => id,
                        ),
                      )
                    }
                    placeholder="Select Confluence spaces"
                  />
                </Stack>

                <Inline space="space.150" alignBlock="center">
                  <Button appearance="primary" isDisabled={savingSetup} onClick={() => void saveSetup()}>
                    {savingSetup ? 'Saving…' : 'Save Scope Settings'}
                  </Button>
                  <Button isDisabled={savingSetup} onClick={() => void loadSetup()}>
                    Reload Options
                  </Button>
                  {setupSaved && <Text>Scope settings are saved.</Text>}
                </Inline>
                <Text>Only Jira site administrators can save these settings.</Text>
              </Stack>
            ) : (
              <Text>Loading setup options…</Text>
            )}
          </Stack>
        )}
      </Stack>
    </Box>
  );
}

ForgeReconciler.render(<App />);
