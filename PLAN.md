# Precedent: Decision Graph for Atlassian

Codegeist 2026 project brief. Working name: Precedent. Category: Apps for Software Teams. Bonus targets: Rovo agent, Teamwork Graph, Atlassian MCP, Marketplace.

By Talha

## 1. One-Line Summary

Precedent turns the decisions buried in Confluence pages and Jira comments into a living, structured memory, and warns teams at the exact moment new work contradicts a decision they already made.

## 2. The Problem

Teams decide things constantly: which library to avoid, which service owns payments, which feature is being dropped. Those decisions live in meeting notes, ADRs, page comments, and ticket threads. Over time three failures repeat:

- **Silent violation.** New work contradicts an old decision and nobody notices until it causes a bug, a rework, or a compliance issue.
- **Re-litigation.** The same topic is debated again because nobody can find the earlier outcome or its reasoning.
- **Lost rationale.** The decision survives, the reason does not, so nobody knows whether it still applies.

New joiners, rotating owners, and growing teams make this worse. Existing tools store pages but do not understand decisions as objects that can be checked against new work.

## 3. Why This Project Fits the Hackathon

The challenge brief frames Teamwork Graph as organizational memory that tells teams what has already been decided and what needs to happen next. Precedent is a direct answer to that framing.

**Rubric mapping (five criteria, 20% each):**

- **Technological Implementation:** extraction pipeline, scoping and linking, a two-stage conflict engine (retrieval then reasoning), confidence handling, an evaluation harness. Works on any site after install, not one hardcoded path.
- **Design:** a complete product loop (capture, confirm, browse, detect, resolve, audit) with a consistent visual language across Jira, Confluence, and the agent.
- **Potential Impact:** a specific, credible problem for engineering teams, demonstrated with a concrete before-and-after.
- **Innovation/Idea:** decisions as first-class objects with lineage (supersedes, depends-on) and contradiction detection at the moment of drift.
- **Presentation:** one dramatic demo moment, a clear problem statement, and an end-to-end flow inside five minutes.

**Bonus prize alignment:**

- Best Agents: a Rovo agent plus reusable actions other agents can call.
- Best app with Atlassian MCP: a Forge-hosted MCP server that lets coding agents check decisions before acting.
- Best Teamwork Graph integration: decisions and their relationships connected into, and read from, the graph (scope depends on available API surface, see Open Questions).
- Best Marketplace published app: submit for listing and include the listing or review ticket link.

## 4. Users and Their Needs

- **Engineer / issue author:** wants to know early, not at review time, that a plan conflicts with a prior decision, and why that decision exists.
- **Tech lead / architect:** wants decisions captured without extra ceremony, and wants to supersede a decision with a recorded reason rather than letting it rot.
- **New joiner:** wants to ask "why do we do X?" and get a sourced answer.
- **Engineering manager / PM:** wants visibility into decision health: how many decisions exist, how many are stale, how often they are violated.
- **Admin:** wants control over scope, permissions, and data handling.

## 5. Product Principles

- **Human-confirmed, machine-assisted.** The AI proposes; people confirm. This protects accuracy and shows design maturity.
- **Evidence over assertion.** Every alert and answer links back to the source page, comment, or ticket.
- **Quiet by default.** A noisy tool gets disabled. Alerts need a confidence threshold, easy dismissal, and a feedback path.
- **Honest uncertainty.** "No conflict found" and "I cannot find a rationale" are valid, visible outcomes.
- **Respect permissions.** Never reveal a decision to someone who cannot see its source.
- **Works on arbitrary data.** Everything must function on a fresh site a judge installs it on.

## 6. Scope: What We Build

Features are grouped by priority tier, not by sequence. Must-have features form the complete core loop. Should-have features raise the score materially. Could-have features are stretch upgrades only if the core is solid.

### Tier A: Core Loop (Must Have)

#### A1. Installation and First-Run Setup

- **What:** An onboarding screen after install that explains the product, lets an admin choose which Confluence spaces and Jira projects to include, and starts an initial scan.
- **Why:** Judges install on their own sites. A smooth first run proves the app is real and not a seeded demo, and it populates the registry immediately.
- **How:** A Confluence global page or Jira admin page (UI Kit or Custom UI) with space and project pickers. Selections stored in app storage. The scan runs through the async job queue so it survives long runtimes. Show progress and handle partial failure gracefully.

#### A2. Decision Data Model and Storage

- **What:** A structured record for each decision (see Section 9).
- **Why:** Everything else depends on decisions being queryable objects with status and lineage.
- **How:** Store in Forge storage (key-value or custom entities with indexes) or Forge SQL if relational queries prove necessary. Choose based on query needs: lookups by scope, status, and relationships favor a store with indexes. Keep a schema version field to allow migrations.

#### A3. Decision Extraction Pipeline

- **What:** Detect decision statements in Confluence pages and Jira comments and convert them into candidate decision records with statement, rationale, scope hints, and source reference.
- **Why:** This is how the registry fills itself without asking teams to adopt a new habit.
- **How:**
  - Trigger on Confluence page created and updated events and Jira comment events, plus the initial backfill job.
  - Chunk content by section so rationale stays attached to its statement.
  - Prompt the model for strict JSON output (statement, rationale, scope, owner hint, confidence, source quote location).
  - Validate output against a schema; discard or retry malformed results.
  - Deduplicate against existing decisions using normalized text plus semantic similarity.
  - Idempotency: key on source id plus content hash so reprocessing the same content never creates duplicates.
  - Respect rate limits with queued processing and backoff.

#### A4. Review Inbox (Human Confirmation)

- **What:** A queue of candidate decisions. Each can be confirmed, edited, rejected, or merged into an existing decision, with one click for the common case.
- **Why:** Trust. Confirmed decisions are the ground truth that conflict detection runs against, which keeps false positives low.
- **How:** A global page listing candidates with the source excerpt highlighted, confidence shown, and inline editing of statement, rationale, and scope. Bulk-confirm for high-confidence items. Record who confirmed and when.

#### A5. Decision Registry (Browse and Search)

- **What:** A searchable, filterable list of all confirmed decisions with status (active, superseded, expired, under review), scope, owner, and source.
- **Why:** A visible, useful artifact on its own, and the foundation for the agent and for analytics.
- **How:** Global page with filters (project, component, owner, status, date), full-text search, and a detail view showing rationale, source links, related decisions, and conflict history.

#### A6. Scoping and Linking

- **What:** Each decision is tied to what it governs: Jira projects, components, labels, and optionally keywords or code paths.
- **Why:** Checking every issue against every decision is noisy and expensive. Scope narrows candidates before any model call.
- **How:** Infer scope from the source location (the space, the project mentioned, labels, linked issues) and let the reviewer adjust it. Store scope as structured fields used by the retrieval step.

#### A7. Conflict Detection Engine

- **What:** On issue creation and meaningful edits, evaluate the issue against active decisions in scope and decide whether it contradicts any.
- **Why:** This is the headline capability and the main demo moment.
- **How:** A two-stage design.
  - **Stage 1, retrieval:** filter active decisions by scope, then rank by text similarity to the issue's summary, description, and recent comments. Keep the top few candidates. This keeps cost and latency down.
  - **Stage 2, judgment:** for each candidate, ask the model whether the issue contradicts the decision. Return a verdict (conflict, possible conflict, no conflict), confidence, a one-sentence explanation, and the specific phrases that triggered it.
  - Apply thresholds: show conflicts above a confidence level, show possible conflicts in a softer style, hide the rest.
  - Cache results per issue content hash; re-evaluate only when the issue changes materially.
  - Log every verdict for the evaluation harness and feedback loop.

#### A8. Jira Issue Warning Panel

- **What:** A panel on the issue view that shows detected conflicts: the decision, who made it, when, why, a link to the source, and the available actions.
- **Why:** It surfaces the warning where the author is already working, so it changes behavior at the right moment.
- **How:** A Jira issue panel module reading the stored verdicts. Show a clear empty state ("No conflicts with active decisions"), a loading state, and an error state. Keep the layout compact and scannable.

#### A9. Resolution Workflows

- **What:** Three actions on each conflict: comply (adjust the plan), supersede (replace the decision with a new one and a reason), or request an exception (time-boxed, with justification).
- **Why:** Detection without resolution is just nagging. A recorded resolution closes the loop and improves the registry.
- **How:**
  - Comply: dismiss with a note; optionally add a comment to the issue.
  - Supersede: create a new decision, mark the old one superseded, link them, notify dependents.
  - Exception: store a scoped, expiring exception and tag the issue.
  - Permission rules: only designated roles can supersede or approve exceptions.
  - Every action writes to an audit log.

### Tier B: High-Impact Upgrades (Should Have)

#### B1. Decision Lineage View

- **What:** A visual graph showing a decision, what it supersedes, what depends on it, and the issues and pages that reference it.
- **Why:** It makes the "graph" tangible, supports the Teamwork Graph story, and gives presentation a strong visual.
- **How:** A Custom UI page (React) with a lightweight graph or tree layout. Nodes are decisions, edges are supersedes and depends-on. Click-through to detail. Keep it readable: limit depth, collapse large clusters.

#### B2. Rovo Agent: "Why do we do X?"

- **What:** A conversational agent that answers questions about decisions with sources, and states plainly when no rationale is found.
- **Why:** New joiners and busy leads get answers without searching. It also qualifies for the Best Agents bonus.
- **How:** Define a Rovo agent module with actions that search the registry, fetch a decision and its lineage, and list conflicts for an issue. Craft the agent's instructions to always cite sources and to admit gaps. Expose the actions as reusable skills other agents can invoke.

#### B3. Teamwork Graph Integration

- **What:** Represent decisions and their relationships in the graph where the API allows, and read related entities from it to enrich scope and context.
- **Why:** It aligns with the central theme of the challenge and the Teamwork Graph bonus.
- **How:** Verify what read and write surface is available to Forge apps. Where write is supported, publish decision objects and relations. Where it is not, store natively and consume graph data to enrich linking (related issues, people, pages). Document exactly what the integration does for the bonus submission.

#### B4. MCP Server for Coding Agents

- **What:** An MCP server exposing tools such as check\_decisions(task\_description, scope), get\_decision(id), and explain\_decision(id), so coding agents can consult decisions before acting.
- **Why:** It targets the MCP bonus and shows the product is useful beyond human UI.
- **How:** Implement the Forge MCP server module per current documentation. Tools return compact, cited results suitable for agent context. Enforce the same permission checks as the UI.

#### B5. Notifications and Escalation

- **What:** Notify the decision owner when their decision is violated, superseded, or approaching its review date, and notify dependents when a decision they rely on changes.
- **Why:** Keeps the registry alive and ownership meaningful.
- **How:** Use the available notification mechanism (issue comments, mentions, or product notifications) with rate limiting and a per-user opt-out.

#### B6. Decision Health Dashboard

- **What:** Metrics: total active decisions, stale decisions, violations detected, resolution rates, top-violated decisions, and re-litigation hotspots.
- **Why:** Gives managers a reason to adopt it and strengthens the impact story with real numbers.
- **How:** A dashboard page (or Jira dashboard gadget) computed from stored decisions, verdicts, and resolution events. Keep charts simple and legible.

#### B7. Feedback Loop

- **What:** "Was this helpful?" on each conflict and extraction, feeding an evaluation view.
- **Why:** Demonstrates technical maturity and enables threshold tuning.
- **How:** Store feedback with the verdict id; compute precision from feedback; surface it in an admin view.

### Tier C: Stretch (Could Have)

#### C1. Bitbucket Pull Request Check

- **What:** Evaluate PR titles, descriptions, and changed areas against active decisions and show a conflict card on the PR.
- **Why:** Extends the product to the point where code is written.
- **How:** Use available Bitbucket modules and events; reuse the conflict engine with PR text as input.

#### C2. Re-Litigation Detector

- **What:** Detect topics debated repeatedly across pages and tickets without a recorded outcome, and generate a short decision brief to force closure.
- **How:** Cluster similar discussions over time; flag clusters with no linked decision.

#### C3. Decision Expiry and Review Cycles

- **What:** Optional review dates and automatic "still valid?" prompts.
- **How:** Scheduled trigger scanning for decisions past their review date.

## 7. Architecture

**Platform:** Atlassian Forge, Node.js and TypeScript, with React for UI.

**Main components:**

- **Event handlers (triggers):** Confluence page created/updated, Jira issue created/updated, Jira comment created. They enqueue work rather than doing heavy processing inline.
- **Async job queue consumers:** extraction jobs, conflict evaluation jobs, backfill jobs. Used because long operations exceed normal function limits (verify current limits).
- **Services layer (pure, testable modules):** extractor, scoper, retriever, judge, resolver, notifier. Keep these functional and free of platform calls so they can be unit-tested.
- **Storage layer:** a repository module wrapping Forge storage so the rest of the code never touches raw storage calls.
- **UI surfaces:** Jira issue panel, global page for registry/inbox/dashboard/lineage, admin settings.
- **Agent and MCP layer:** Rovo agent actions and the MCP server both call the same services layer, so behavior is identical across surfaces.

**Data flow (core loop):**

1. Content changes in Confluence or Jira, and a trigger fires.
2. A job is queued; the extractor produces candidate decisions.
3. Candidates appear in the review inbox; a person confirms them.
4. An issue is created or edited, and a trigger fires.
5. The retriever narrows decisions by scope and similarity; the judge evaluates candidates.
6. Verdicts are stored; the issue panel displays them.
7. The author resolves (comply, supersede, exception); the audit log records it.

**Design rules for the code:**

- Functional style, small pure functions, explicit inputs and outputs.
- Strong typing with shared TypeScript types and schema validation (for example Zod) at every boundary: model output, storage reads, event payloads.
- Result types or consistent error objects instead of thrown strings; retries with backoff on transient failures.
- Structured logging with correlation ids per job.

## 8. AI Approach

- **Model access:** Choose among Rovo-based reasoning, Forge LLMs (optional, no credits provided), or an external model via Forge remote. Confirm in the rules and docs whether each choice affects eligibility or platform badges before committing. Design the judge and extractor behind an interface so the provider can be swapped.
- **Prompting:** strict JSON schemas, short instructions, explicit "say no conflict if unsure" guidance, and few-shot examples drawn from realistic engineering decisions.
- **Cost and latency control:** scope filtering, top-k retrieval, content-hash caching, and queued evaluation.
- **Quality control:** an evaluation set of labeled examples (clear conflict, subtle conflict, near-miss, unrelated) run on every prompt change, tracking precision and recall.
- **Safety:** treat all page and ticket content as untrusted input; the model must never follow instructions embedded in that content, and outputs are only ever parsed as data.

## 9. Data Model

**Decision**

- id, statement, rationale, status (active, superseded, expired, under\_review), owner, createdAt, confirmedBy, confirmedAt, reviewDate (optional)
- scope: projects, components, labels, keywords
- source: type (page or comment), id, url, quoted excerpt, content hash
- confidence (at extraction), schemaVersion

**DecisionRelation**

- fromId, toId, type (supersedes, depends\_on, related\_to), createdBy, createdAt, reason

**Candidate**

- id, proposed Decision fields, source, status (pending, confirmed, rejected, merged), mergeTargetId

**Verdict**

- id, issueKey, decisionId, verdict (conflict, possible\_conflict, no\_conflict), confidence, explanation, triggeringPhrases, issueContentHash, createdAt, modelVersion

**Resolution**

- id, verdictId, action (comply, supersede, exception), actor, note, newDecisionId (if superseded), exceptionExpiry (if exception), createdAt

**Feedback**

- id, targetType, targetId, helpful (boolean), comment, actor, createdAt

**AuditLog**

- id, actor, action, targetType, targetId, before, after, timestamp

**Settings**

- included spaces and projects, confidence thresholds, roles allowed to supersede or approve exceptions, notification preferences

## 10. Forge Modules and Permissions (Verify Against Current Docs)

**Likely modules:**

- Jira issue panel (warning panel)
- Confluence global page and/or Jira global page (registry, inbox, dashboard, lineage)
- Admin page for settings
- Product event triggers (Jira issue and comment events, Confluence content events)
- Scheduled trigger (for expiry and maintenance)
- Async events / queues (extraction, evaluation, backfill)
- Rovo agent module with actions (and reusable skills)
- MCP server module
- Optional: Jira dashboard gadget; Bitbucket modules for the stretch feature

**Permissions:** request the minimum scopes for reading Jira issues and comments, reading Confluence content and spaces, and the storage and event capabilities needed. Prefer user-context calls when displaying data so Atlassian permissions are enforced automatically; use app-context calls only where necessary and apply explicit permission checks.

**UI approach decision:** UI Kit is faster and matches Atlassian styling; Custom UI allows richer visualization (lineage graph, dashboard). Plan for UI Kit on the issue panel and Custom UI where visualization needs it, and verify current capabilities of each.

## 11. UX and Design Specification

Design is 20% of the score, so treat it as a product, not a skin.

**Screens:**

- First-run setup with progress
- Review inbox
- Decision registry with filters and detail drawer
- Issue warning panel (conflict, possible conflict, empty, loading, error states)
- Resolution dialogs (comply, supersede, exception)
- Lineage view
- Health dashboard
- Admin settings

**Design rules:**

- Follow the Atlassian Design System tokens, spacing, and components so the app feels native.
- Use clear status badges (active, superseded, expired) with accessible contrast.
- Every alert answers four questions at a glance: what conflicts, with which decision, who decided and when, and why.
- Provide empty states with a next action, never blank screens.
- Keep copy short, specific, and neutral in tone; avoid blaming language.
- Accessibility: keyboard navigation, focus states, labels, and sufficient contrast.

## 12. Testing and Quality Bar

- **Unit tests** for the pure services (extractor parsing, scoper, retriever ranking, verdict thresholds, supersession logic).
- **Evaluation harness** with a labeled set of decisions and issues, reporting precision and recall for extraction and conflict detection; used as the gate for prompt changes.
- **Integration tests** against a dedicated test site with varied content: well-written ADRs, messy meeting notes, comment threads, and unrelated pages.
- **Edge cases:** empty pages, very long pages, non-English content, deleted or moved sources, permission-restricted sources, duplicate events, rapid edits, rate limit responses.
- **Resilience:** idempotent jobs, retries with backoff, safe partial failure during backfill.
- **Fresh-install check:** install on a clean site and complete the core loop with no manual database work.

## 13. Security and Privacy

- Keep data inside Atlassian-hosted storage wherever possible; if any external model is used, document exactly what is sent and minimize it.
- Enforce permissions: never show a decision or its excerpt to a user who cannot view the source.
- Treat all ingested content as untrusted; defend against prompt injection by isolating instructions from content and validating outputs against schemas.
- Provide data deletion: removing a decision or uninstalling clears stored data.
- Record an audit trail for supersessions and exceptions.

## 14. Demo and Seed Data Strategy

- Build a realistic demo site with a believable engineering organization: several ADR-style pages, meeting notes with decisions buried in them, comment threads, and a mix of Jira projects.
- Include deliberately varied cases: a clear violation, a subtle violation, a near-miss that should not trigger, a decision that was later superseded, and a decision with no rationale recorded.
- Provide a seeding script so the site can be reset to a known state.
- Separately verify the product on a clean site with different content to prove it is not tuned to the demo.

## 15. Submission Requirements Checklist

From the Codegeist overview page:

- **Access:** an installation link plus clear instructions for judges, created using Forge's "start sharing your app" flow.
- **Demo video:** under 5 minutes, uploaded to YouTube and public, showing the project working end to end and the specifics of each bonus prize targeted.
- **Category:** Apps for Software Teams, with bonus prizes identified and supporting materials provided.
- **Explanation:** a written description of how the project meets the main technology requirement (a Forge app integrating with Jira, Confluence, Teamwork Graph, and Rovo).
- **Marketplace bonus:** the listing link or the Marketplace review ticket link.
- **Submit:** complete the entire Devpost form before the deadline.

**Demo video outline:**

1. The problem in one sentence with a real-feeling example (about 30 seconds).
2. Setup and first-run scan on a fresh site.
3. Review inbox: confirming extracted decisions.
4. The headline moment: a new issue contradicts an old decision and the panel explains it with sources.
5. Resolution: superseding the decision with a recorded reason; lineage view updates.
6. The Rovo agent answering "why do we do X?" with citations and one honest "no rationale found" case.
7. MCP: a coding agent checking decisions before acting.
8. Health dashboard and Marketplace status; close with the impact statement.

## 16. Risks and Mitigations

- **False positives annoy judges.** Mitigate with confirmed-only decisions, scope filtering, confidence thresholds, dismissible alerts, and visible feedback.
- **Model access constraints.** Mitigate by abstracting the provider and confirming eligibility rules early.
- **Teamwork Graph write limits.** Mitigate by storing natively and consuming graph data, and by documenting the integration precisely.
- **Latency and cost.** Mitigate with retrieval before judgment, caching, and queued processing.
- **Scope sprawl.** Mitigate by treating Tier A as the product and everything else as upgrades; cut Tier C first.
- **Demo fragility.** Mitigate with a resettable seed site and a rehearsed script.
- **Permission leaks.** Mitigate with user-context reads and explicit checks.

## 17. Out of Scope

- Replacing Confluence or Jira search generally.
- Automatically blocking issue creation or workflow transitions (alerts inform, humans decide).
- Non-Atlassian sources in the first version.
- Fine-tuning custom models.

## 18. Open Questions to Verify in Documentation

- Which Teamwork Graph read and write APIs are available to Forge apps today, and with what constraints.
- Which AI options are allowed and how each affects eligibility or platform badges.
- Current module names and manifest syntax for the Rovo agent, reusable skills and actions, and the MCP server module.
- Current runtime and payload limits for functions and async events.
- Best storage choice (key-value, custom entities, or SQL) for the query patterns above.
- Available notification mechanisms for apps.
- Marketplace listing and review requirements for the bonus.
- Whether the full rules page adds requirements beyond the overview page.

## 19. Definition of Done

- A judge can install the app on a fresh site, complete first-run setup, and see decisions extracted from their own content.
- Confirmed decisions power conflict detection on new issues with explanations, sources, and working resolution actions.
- The lineage view, agent, and MCP server each work against real data and respect permissions.
- The evaluation harness shows acceptable precision on the labeled set.
- All screens have loading, empty, and error states.
- The submission package is complete: install link, instructions, public video under five minutes, category and bonus declarations, explanation text, and Marketplace link.
