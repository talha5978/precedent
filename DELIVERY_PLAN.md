# Precedent delivery plan

This sequence turns the product brief in [PLAN.md](./PLAN.md) into releasable milestones. Tier A
is the required product loop; Tier B follows once that loop works on a clean site; Tier C is stretch.
Keep each milestone deployable, and verify Forge limits and APIs before adopting a platform module.

## Milestone 0 — Establish a deployable, secure foundation

- Register the Forge app, replace the placeholder app ID, and preserve the selected Jira-required /
  Confluence-optional compatibility model (Forge locks this model after deployment).
- Install Node.js/npm and Forge CLI; pin dependency versions with a lockfile.
- Validate the manifest and deploy the current Jira global page to a development site.
- Add minimum permission scopes only when each feature requires them.
- Add typed domain contracts, boundary validation, structured errors, and correlation IDs.
- **Done when:** a clean clone installs, typechecks, and the app deploys to a dev site.

## Tier A — Core loop

### 1. Installation and first-run setup (current milestone)

- Fetch projects and spaces the current user can see.
- Let an authorized site admin select included Jira projects and Confluence spaces.
- Persist versioned settings and show the saved selection on return visits.
- Add scan status, progress, retry, and partial-failure states before launching backfill.
- **Done when:** a fresh installation can save and reload its scope without seeded data.

### 2. Decision model and storage

- Define versioned Decision, DecisionRelation, Candidate, Verdict, Resolution, Feedback, AuditLog,
  and Settings schemas from PLAN.md.
- Add runtime validation and pure migrations; hide storage behind typed repositories.
- Select KVS vs Custom Entity Store based on verified scope/status query patterns and current
  limits; avoid premature SQL unless measured query needs justify it.
- **Done when:** repositories validate reads/writes and preserve schema versioning.

### 3. Scoping and linking

- Normalize project, component, label, keyword, and code-path scope.
- Infer initial scope from source location and linked issues; make reviewer edits authoritative.
- **Done when:** scope matching is deterministic and has explicit empty/global-scope behavior.

### 4. Extraction pipeline and initial backfill

- Add idempotent source event handlers for Confluence pages and Jira comments.
- Build section-aware chunking, extraction-provider interface, strict output validation, and
  source quote locations.
- Queue backfill and extraction work with rate-limit-aware retries, deduplication, and progress.
- Treat ingested text as untrusted instructions; only parse validated model data.
- **Done when:** repeated and out-of-order events produce no duplicate candidates and partial scans
  can resume safely.

### 5. Human review inbox

- List candidates with confidence, source excerpt, and links.
- Implement confirm, edit, reject, merge, and high-confidence bulk confirmation.
- Record reviewer and timestamp; only confirmed decisions become eligible for conflict checks.
- **Done when:** reviewers can resolve every candidate state and the audit trail is attributable.

### 6. Decision registry

- Add searchable/filterable active, superseded, expired, and under-review decisions.
- Add detail view with rationale, source, scope, related decisions, and conflict history.
- Add loading, empty, error, and permission-denied states.
- **Done when:** confirmed decisions are findable and source citations are permission-safe.

### 7. Conflict detection engine

- Define provider-neutral judge contract and verdict schema.
- Retrieve active, in-scope decisions and rank top candidates before model judgment.
- Add confidence thresholds, content-hash cache, material-change invalidation, and verdict logs.
- **Done when:** clear conflicts, subtle conflicts, near-misses, and unrelated issues produce
  appropriately calibrated results.

### 8. Jira issue warning panel

- Trigger asynchronous evaluation on issue create and meaningful edits.
- Display conflict, possible conflict, no-conflict, loading, and failure states with decision,
  owner/date, explanation, source, and actions.
- **Done when:** an issue author sees a sourced result without blocking issue creation.

### 9. Resolution workflows

- Implement comply/dismiss with note, supersede with reason and lineage, and expiring exception.
- Enforce role checks for supersession and exception approval; record each mutation in audit log.
- **Done when:** every conflict can be resolved and the registry/verdict state reflects that action.

### 10. Core hardening and quality gate

- Enforce source permissions on every UI/API path; implement uninstall/deletion handling.
- Add retry/backoff, idempotency, rate-limit handling, observability, and safe partial failure.
- Build unit/integration coverage plus a labeled extraction/conflict evaluation set and report
  precision/recall; test fresh-install behavior and permission-restricted sources.
- **Done when:** the core loop survives duplicate events, rapid edits, missing sources, and transient
  failures on a clean Atlassian site.

## Tier B — High-impact upgrades

11. **Lineage view:** bounded/collapsible graph of supersedes, depends-on, related decisions, pages,
    and issues.
12. **Rovo agent:** source-cited decision search/detail/lineage/conflict actions; explicit uncertainty.
13. **Teamwork Graph:** verify API surface and eligibility, enrich scope and write relationships only
    where currently supported; document actual integration accurately.
14. **MCP server:** implement supported Forge MCP module and permission-checked check/get/explain tools.
15. **Notifications:** owner/dependent notices for violations, supersession, and reviews; add opt-out
    and rate limits.
16. **Health dashboard:** active/stale counts, violations, resolutions, top violations, and recurring
    debate topics with clear definitions for each metric.
17. **Feedback loop:** collect feedback on extraction/verdicts and expose precision/usefulness trends.

## Tier C — Stretch

18. **Bitbucket pull-request check:** reuse scope/retrieval/judgment for title, description, and
    changed areas.
19. **Re-litigation detector:** cluster repeated discussions with no confirmed outcome and propose a
    sourced decision brief.
20. **Expiry/review cycles:** scheduled prompts for decisions at or past their review date.

## Release and submission

21. Seed/reset a realistic demo site, while separately proving the core loop on a clean site.
22. Complete Marketplace review/listing preparation and produce judge install instructions/link.
23. Record and publish the under-five-minute demo; complete Codegeist category, bonus, and explanation
    materials; submit the full Devpost entry.

## Current progress

- [x] Repository and Forge app shell initialized.
- [x] Milestone 0: register/deploy-ready baseline (Node.js 24 pinned for local Forge CLI and Forge
  functions, lockfile checked in, and app registered and deployed to the Jira development site).
- [ ] Tier A, step 1: first-run project/space scope setup (in progress).
  - [x] Load up to 1,000 visible Jira projects and Confluence spaces, with truncation warnings.
  - [x] Save and reload schema-versioned scope through Forge KVS; restrict writes to Jira admins.
  - [ ] Add initial scan kickoff, progress, retry, and partial-failure states when the extraction
    queue is implemented in step 4.
- [ ] Tier A, step 2: decision model and storage (in progress).
  - [x] Define schema-versioned domain records and runtime validators.
  - [x] Add typed KVS repositories with validated reads/writes and cursor-based listing.
  - [x] Add a pure migration from the previously saved scope-only settings to the current settings
    schema, preserving selected projects/spaces and writing the upgraded record before removing the
    legacy key.
  - [x] Route setup reads/writes through the typed settings repository while keeping its response
    contract focused on project/space scope.
  - [ ] Add migrations as prior decision schemas emerge; connect domain repositories to the review
    and registry flows.
- [ ] Tier A, step 3: scoping and linking (in progress).
  - [x] Normalize IDs, labels, components, keywords, and paths deterministically.
  - [x] Add pure initial-scope inference from a Jira source project and linked issue metadata.
  - [x] Define matching semantics: empty dimensions are unrestricted, values in a dimension are
    alternatives, populated dimensions combine as restrictions, and an entirely empty scope is
    global.
  - [ ] Connect source metadata and reviewer-edited scope to extraction and conflict retrieval.
