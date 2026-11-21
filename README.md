# Precedent

Precedent is an Atlassian Forge app that turns decisions in Confluence and Jira into a sourced,
reviewable registry and warns teams when new work may contradict an active decision.

## Development status

This repository starts the Forge app foundation and the first Jira global page. The feature scope
below follows [PLAN.md](./PLAN.md), which remains the detailed product and architecture brief.

### Tier A — core loop

1. **Install and first-run setup:** admin selects Confluence spaces and Jira projects; a queued scan
   reports progress and partial failures.
2. **Decision model and storage:** versioned decision, relation, candidate, verdict, resolution,
   feedback, audit, and settings records behind a repository layer.
3. **Extraction pipeline:** event and backfill processing extracts, validates, deduplicates, and
   idempotently stores candidates with source evidence.
4. **Review inbox:** people confirm, edit, reject, or merge candidates, with bulk confirmation for
   high-confidence results.
5. **Decision registry:** search, filters, status, detail, rationale, sources, lineage, and history.
6. **Scoping and linking:** structured project, component, label, and keyword scope, editable during
   review.
7. **Conflict engine:** scoped retrieval, ranked candidates, model judgment, confidence thresholds,
   content-hash caching, and verdict logging.
8. **Jira warning panel:** compact conflict, possible-conflict, clear, loading, and error states.
9. **Resolution workflows:** comply, supersede, or request a time-boxed exception with permissions
   and audit records.

### Tier B — high-impact upgrades

- **Decision lineage view:** navigate decisions, supersession/dependency links, pages, and issues.
- **Rovo agent:** answer “why?” questions and return cited decisions and conflict context.
- **Teamwork Graph:** enrich linking and publish decision relationships where supported.
- **MCP server:** expose permission-checked decision lookup and conflict checking to coding agents.
- **Notifications:** alert owners about violations, supersession, and review dates with rate limits
  and opt-outs.
- **Health dashboard:** active/stale decisions, violations, resolutions, and re-litigation hotspots.
- **Feedback loop:** collect usefulness feedback and report evaluation metrics.

### Tier C — stretch

- **Bitbucket pull request check:** evaluate PR text and changed areas against active decisions.
- **Re-litigation detector:** cluster repeated discussions without a recorded outcome.
- **Expiry and review cycles:** schedule prompts for decisions past their review date.

## Local setup

Install Node.js 20+, npm, and the Forge CLI. Register this app with Atlassian, then replace the
placeholder app ID in `manifest.yml` with the registered app ID. Jira is required; Confluence is an
optional product connection, so connect it on sites where Precedent should scan Confluence. Run:

```sh
npm install
npm run dev
```

Deploy and install it on a development site with `npm run deploy` and `npm run install:site`.
Before enabling content ingestion, verify Forge module availability, storage/index options, queue
limits, AI eligibility, and permission scopes against the current platform documentation.

## Product principles

- Machine proposals require human confirmation before they become active decisions.
- Every answer and alert must cite its source, subject to the viewer’s permissions.
- Keep alerts quiet, make uncertainty explicit, and provide a feedback path.
- Treat Atlassian content as untrusted input and validate all model and storage boundaries.
