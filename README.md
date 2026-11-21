# Precedent: Decision Graph & Contradiction Governance for Atlassian

> **Turn decisions buried in Confluence pages and Jira comments into a living, structured organizational memory, and warn teams at the exact moment new work contradicts a decision they already made.**

[![Atlassian Forge](https://img.shields.io/badge/Platform-Atlassian%20Forge-blue.svg)](https://developer.atlassian.com/platform/forge/)
[![Node.js Runtime](https://img.shields.io/badge/Node.js-24.x%20LTS-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript%20Strict-blue.svg)](https://www.typescriptlang.org/)
[![Test Suite](https://img.shields.io/badge/Tests-35%20passed%20(100%25)-brightgreen.svg)](https://nodejs.org/api/test.html)
[![Codegeist 2026](https://img.shields.io/badge/Codegeist-2026-orange.svg)](https://codegeist.devpost.com/)

---

## 1. Overview & Problem Statement

Engineering teams make binding technical and architectural decisions daily:
- *Which database to standardize on?*
- *Which third-party libraries or cloud services to avoid?*
- *How microservices must communicate?*
- *When features or legacy endpoints are deprecated?*

These decisions inevitably get buried in meeting notes, ADR pages, Jira tickets, and pull request comments. Over time, three failure modes repeat across growing teams:
1. **Silent Violations**: New Jira tickets unintentionally contradict established architectural decisions. Nobody catches it until code review, staging, or production outage.
2. **Re-Litigation**: Teams spend hours or weeks re-debating topics already settled because nobody can locate the prior consensus.
3. **Lost Rationale**: A rule survives ("use Postgres only"), but the reason why is lost—leading teams to either obey stale mandates blindly or bypass them indiscriminately.

**Precedent** solves this by treating engineering decisions as **first-class structured objects with lineage**, capturing them through AI-assisted extraction with human confirmation, and intercepting contradictions in real time directly within Jira issue panels and Rovo agent chats.

---

## 2. Core Architecture & Product Loop

```
┌─────────────────────────────────┐        ┌──────────────────────────────────┐
│  Confluence Pages & ADR Notes   │        │     Jira Issues & Comments       │
└────────────────┬────────────────┘        └─────────────────┬────────────────┘
                 │                                           │
                 ▼                                           ▼
       ┌──────────────────────────────────────────────────────────────┐
       │             Chunking & Ingestion Pipeline                    │
       │    (Section Boundary Splitting & Idempotent Hashing)         │
       └──────────────────────────────┬───────────────────────────────┘
                                      │
                                      ▼
       ┌──────────────────────────────────────────────────────────────┐
       │     Candidate Proposal Engine (AI-Assisted Extractor)        │
       │   Statement, Rationale, Governed Scope & Source Citations    │
       └──────────────────────────────┬───────────────────────────────┘
                                      │
                                      ▼
       ┌──────────────────────────────────────────────────────────────┐
       │            Review Inbox (Human Confirmation)                 │
       │  Architects Confirm / Edit / Reject before Rule Activation   │
       └──────────────────────────────┬───────────────────────────────┘
                                      │ (Active Ground Truth)
                                      ▼
       ┌──────────────────────────────────────────────────────────────┐
       │                   Decision Registry & Graph                  │
       │   Multi-hop Lineage: `supersedes`, `depends_on`, `related`   │
       └──────┬───────────────────────┬───────────────────────┬───────┘
              │                       │                       │
              ▼                       ▼                       ▼
    ┌──────────────────┐    ┌───────────────────┐   ┌───────────────────┐
    │ Jira Issue Panel │    │  Rovo AI Agent    │   │ Health Dashboard  │
    │  Real-time Drift │    │ "Why do we do X?" │   │ Hotspots, Audits  │
    │  & Resolutions   │    │ Cited Q&A Tooling │   │ & Governance KPIs │
    └──────────────────┘    └───────────────────┘   └───────────────────┘
```

---

## 3. Key Features

### 🏛️ Tier A: The Core Governance Loop
- **First-Run Project & Space Setup**:
  - Jira site administrators easily choose monitored Jira projects and Confluence spaces.
  - Settings stored via typed, versioned Forge KVS storage with permission guards.
- **Decision Extraction Pipeline**:
  - Section-aware chunking preserving proximity between decision statements and rationales.
  - Deterministic idempotency based on source URL, entity ID, and SHA-256 content hashes to prevent duplicate candidate extraction on subsequent scans.
- **Review Inbox (Human Confirmation)**:
  - *"AI proposes; humans confirm."* Extracted decisions surface in the queue with confidence ratings, source citations, and governed keywords/components.
  - Leads can confirm in one click, edit statement/rationale inline, reject false positives, or bulk confirm high-confidence proposals.
- **Decision Registry & Search**:
  - Central, searchable registry of all active, superseded, under-review, and expired decisions.
  - Deep inspection of source context: quoted excerpt, author attribution, confirmation timestamps, and component tags.
- **Two-Stage Conflict Detection Engine**:
  - **Stage 1 (Retrieval)**: Fast multi-dimensional filtering by Jira project, component, labels, code paths, and keywords.
  - **Stage 2 (Judgment)**: Conflict judge evaluates candidate decisions against issue summaries and descriptions to detect direct contradictions, returning confidence, triggering phrases, and clear explanations.
  - Deterministic content-hash caching prevents redundant evaluations.
- **Jira Issue Warning Panel**:
  - Native `jira:issuePanel` that warns authors immediately upon viewing or updating an issue.
  - Features clear empty states (*"All Clear"*), subtle warnings for possible conflicts, and prominent alerts for direct contradictions.
- **Interactive Resolution Workflows**:
  - **Comply**: Dismiss the warning by documenting how the plan was adjusted to align with the decision.
  - **Supersede**: Replace the prior decision with a new mandate and recorded rationale; automatically marks the old decision superseded and links the lineage relation.
  - **Request Exception**: Grant a time-boxed waiver with required justification and expiration date.
  - Full audit trail logging for all mutations.

---

### 🚀 Tier B: High-Impact Upgrades
- **Decision Lineage Graph View (B1)**:
  - A visual relationship graph displaying multi-hop supersession (`supersedes`) and architectural dependencies (`depends_on`).
  - View previous vs. successor decisions with human-recorded reasons for lineage changes.
- **Atlassian Rovo Agent: "Why do we do X?" (B2)**:
  - Registered `rovo:agent` (**Precedent Decision Agent**) with conversational starters.
  - **3 Reusable Agent Actions (`action` modules)**:
    - `search-decisions-action`: Query decisions by keyword, status, or project.
    - `get-decision-action`: Retrieve full statement, rationale, source excerpt, and lineage.
    - `check-issue-conflicts-action`: Check any Jira ticket key for decision contradictions.
  - Enforces **Evidence over Assertion**: Always cites the originating Confluence page, ADR, or comment.
  - **Honest Uncertainty**: Explicitly returns *"No explicit rationale recorded"* when rationale is absent.
- **Decision Health & Governance Dashboard (B6)**:
  - Executive visibility into architectural health: Active vs. Superseded decisions, Conflict Resolution Rate (%), and breakdown by Comply / Supersede / Exception.
  - **Contradiction Hotspot Leaderboard**: Identifies top-violated architectural decisions to highlight where team alignment or documentation is drifting.
- **Active Feedback Loops (B7)**:
  - Inline 👍 / 👎 feedback widgets on every candidate card in the Review Inbox and verdict card in the Jira Issue Panel to collect precision ratings and tune thresholds.

---

## 4. Product Principles

1. **Human-Confirmed, Machine-Assisted**: AI accelerates discovery by extracting and flagging candidates, but humans remain the authoritative approvers of binding policy.
2. **Evidence Over Assertion**: Every alert, verdict, and agent response cites the original Confluence page, ADR, or Jira comment with quoted excerpts.
3. **Quiet by Default**: Calibrated confidence thresholds and deterministic scoping ensure teams only receive alerts when high-relevance conflicts occur.
4. **Honest Uncertainty**: If no decisions apply or no rationale was recorded in the source text, the app states it plainly instead of hallucinating.
5. **Respect Permissions**: Operations execute within Atlassian user context (`asUser()`), ensuring team members only see decisions extracted from sources they have access to.

---

## 5. Technology Stack

- **Platform**: [Atlassian Forge](https://developer.atlassian.com/platform/forge/) (Cloud-native serverless architecture)
- **Runtime**: Node.js `24.x`
- **Languages**: TypeScript (Strict Mode) & React
- **UI Framework**: Forge UI Kit (`@forge/react`) native components
- **Storage**: Forge Key-Value Storage (`@forge/kvs`) with typed repository abstractions and pure schema migrations
- **APIs**: Jira Cloud REST API v3, Confluence Cloud REST API v2
- **Testing**: Node.js Native Test Runner with custom TypeScript ESM resolution loaders

---

## 6. Project Directory Structure

```text
precedent/
├── manifest.yml                # Forge app manifest (globalPage, issuePanel, rovo:agent, action)
├── package.json                # Dependencies, scripts, and build metadata
├── tsconfig.json               # TypeScript configuration
├── PLAN.md                     # Comprehensive product design brief
├── DELIVERY_PLAN.md            # Phased milestone delivery tracker
├── scripts/
│   ├── register-loader.mjs     # ESM loader registration for TS execution
│   └── test-loader.mjs         # Node.js test runner TS extension resolver
└── src/
    ├── index.ts                # Main backend Forge resolver definitions & Rovo action handlers
    ├── rovoActions.ts          # Pure Rovo agent action implementations
    ├── domain/
    │   ├── models.ts           # Strictly-typed schemas (Decision, Candidate, Verdict, Resolution)
    │   ├── scoping.ts          # Scope normalization, hierarchical path matching, and inference
    │   ├── decisions.ts        # Proposal confirmation, rejection, and filter operations
    │   ├── conflict.ts         # Two-stage retrieval ranking & pattern conflict judge
    │   ├── extractor.ts        # Section chunking, decision heuristic extraction & deduplication
    │   ├── setup.ts            # Space & project scope settings validation
    │   ├── sampleData.ts       # Realistic demo decisions, candidates, and relations
    │   └── __tests__/          # Comprehensive 35-test unit suite
    │       ├── models.test.ts
    │       ├── scoping.test.ts
    │       ├── decisions.test.ts
    │       ├── conflict.test.ts
    │       ├── extractor.test.ts
    │       └── rovo.test.ts
    ├── frontend/
    │   ├── index.tsx           # Global App UI (Registry, Review Inbox, Lineage, Dashboard, Setup)
    │   └── issuePanel.tsx      # Jira Issue Panel UI (Contradiction alerts, Comply/Supersede/Exception)
    └── storage/
        └── repositories.ts     # Generic type-safe KVS repository layer & migrations
```

---

## 7. Installation & Deployment Guide

### Prerequisites
- Node.js `24.x` (or `22.x`)
- npm `10+`
- Atlassian Forge CLI (`npm install -g @forge/cli` or use `npx forge`)
- An Atlassian Cloud Developer Site with Jira and Confluence

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/your-org/precedent.git
cd precedent
npm install
```

### 2. Verify Linting & Unit Tests
```bash
# Run typechecking
npm run typecheck

# Run test suite (35 unit tests across models, scoping, conflict, extractor, and rovo)
npm test

# Run Forge manifest linter
npx forge lint
```

### 3. Deploy to Atlassian Cloud
```bash
# Log in to Forge (if not already authenticated)
npx forge login

# Deploy app to development environment
npx forge deploy

# Install/upgrade on your Atlassian site
npx forge install --upgrade --site <your-site>.atlassian.net --product jira
```

### 4. Local Development with Tunneling
To test live changes locally without continuous manual deployments:
```bash
npx forge tunnel
```

---

## 8. Live Demonstration Guide

To evaluate or demo Precedent in under 5 minutes:

### 1. Seed Demo Data (Instant Evaluation)
1. Open your Jira site and navigate to **Apps > Precedent**.
2. Click **"Seed demo data"** in the top right header.
3. This populates realistic architectural decisions (PostgreSQL 16 mandate, OpenTelemetry standard, gRPC protocols, Redis ephemeral caching) and pending candidates.

### 2. Review & Confirm Candidates
1. Switch to the **Review Inbox** tab.
2. Review the pending candidates (e.g. *GraphQL federation gateway* or *Node.js 22 LTS deprecation*).
3. Inspect the confidence lozenge, source URL, and quoted excerpt.
4. Click **Confirm** (or **Edit & Confirm**) to promote a candidate into an active binding decision.
5. Provide feedback by clicking **👍 Yes** or **👎 No**.

### 3. Inspect Lineage & Health Dashboard
1. Switch to the **Decision Lineage** tab to view the dependency graph:
   - Notice that *PostgreSQL 16* explicitly **supersedes** legacy *PostgreSQL 14*.
   - Notice that *Redis Cache* **depends on** *PostgreSQL* as the authoritative source of truth.
2. Switch to the **Health Dashboard** tab to review real-time decision counts, resolution rates, and contradiction hotspots.

### 4. Intercept Contradictions in Jira
1. Click **Create** in Jira to create a new ticket in your monitored project.
2. Give it a summary:
   > `Setup MongoDB Atlas cluster for user billing and order persistence`
3. Set component to `database` (or describe it in the issue description).
4. Save and open the ticket.
5. In the right-hand **Precedent Decisions** issue panel:
   - Observe the **Contradiction Detected** warning banner.
   - Read the flagged explanation citing the PostgreSQL mandate and prior rationale.
   - Click **Comply**, enter an adjustment note, and resolve the conflict.

### 5. Chat with the Rovo Decision Agent
1. Open Atlassian Rovo chat.
2. Ask: `@Precedent Decision Agent Why do we use PostgreSQL for primary storage?`
3. The agent retrieves the record, cites the source Confluence ADR, and provides the exact architectural rationale.

---

## 9. Security, Permissions & Compliance

Precedent operates strictly within the Forge security boundary:
- **Least-Privilege Scopes**:
  - `storage:app`: Store structured decisions, lineage, and audit logs.
  - `read:jira-work`: Read issue fields for contradiction evaluation.
  - `read:space:confluence`: Scan scoped documentation and meeting notes.
- **Untrusted Input Treatment**: Ingested issue text and Confluence page content are treated strictly as untrusted data, preventing prompt injection attacks.
- **Tenant Isolation**: All data is stored within your Atlassian site's dedicated Forge Key-Value Storage and never leaves Atlassian Cloud.

---

## 10. License

Built for **Codegeist 2026** by Talha. Distributed under the **Apache-2.0 License**.
