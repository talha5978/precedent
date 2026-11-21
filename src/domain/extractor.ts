import {
  CURRENT_SCHEMA_VERSION,
  type Candidate,
  type DecisionProposal,
  type SourceType,
} from './models';
import { computeContentHash } from './conflict';
import { normalizeDecisionScope } from './scoping';

export type SourceContext = {
  type: SourceType;
  id: string;
  url: string;
  projectId?: string;
  spaceKey?: string;
};

export interface DecisionExtractor {
  extract(text: string, context: SourceContext): Promise<DecisionProposal[]>;
}

export type ExtractedSection = {
  heading?: string;
  body: string;
};

/** Split content into sections by markdown or text headings so rationale stays attached to statement */
export function chunkBySections(content: string): ExtractedSection[] {
  const lines = content.split('\n');
  const sections: ExtractedSection[] = [];
  let currentHeading: string | undefined;
  let currentBodyLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);

    if (headingMatch && headingMatch[2]) {
      if (currentBodyLines.length > 0) {
        sections.push({
          heading: currentHeading,
          body: currentBodyLines.join('\n').trim(),
        });
        currentBodyLines = [];
      }
      currentHeading = headingMatch[2].trim();
    } else {
      currentBodyLines.push(line);
    }
  }

  if (currentBodyLines.length > 0) {
    sections.push({
      heading: currentHeading,
      body: currentBodyLines.join('\n').trim(),
    });
  }

  return sections.filter((s) => s.body.length > 0 || (s.heading && s.heading.length > 0));
}

const DECISION_MARKERS = [
  /(?:we\s+decided\s+(?:to|that)|decision:\s*|agreed:\s*|we\s+mandate\s+|standardize\s+on\s+|adopt\s+)([^.\n]+(?:(?:\.[a-zA-Z0-9]+)*[^.\n]+)*)/i,
  /(?:^|\n)\s*(?:decision|resolution|outcome):\s*([^\n]+)/i,
];

const RATIONALE_MARKERS = [
  /(?:because|rationale:\s*|reason:\s*|justification:\s*|in\s+order\s+to|due\s+to)\s+([^.\n]+)/i,
];

const COMPONENT_HINTS = ['database', 'api', 'auth', 'cache', 'infra', 'telemetry', 'frontend', 'security'];

export class HeuristicDecisionExtractor implements DecisionExtractor {
  async extract(text: string, context: SourceContext): Promise<DecisionProposal[]> {
    const sections = chunkBySections(text);
    const proposals: DecisionProposal[] = [];

    for (const section of sections) {
      const combined = `${section.heading ?? ''}\n${section.body}`.trim();
      if (!combined) continue;

      let statement: string | undefined;
      let matchedQuote = '';

      for (const pattern of DECISION_MARKERS) {
        const match = combined.match(pattern);
        if (match && match[1]) {
          statement = match[1].trim();
          matchedQuote = match[0].trim();
          break;
        }
      }

      if (!statement && section.heading && /decision|adr|outcome|standard/i.test(section.heading)) {
        const firstSentence = section.body.split(/[.\n]/)[0]?.trim();
        if (firstSentence && firstSentence.length > 15) {
          statement = firstSentence;
          matchedQuote = firstSentence;
        }
      }

      if (!statement) continue;

      // Extract rationale if present
      let rationale = 'Identified as binding architecture/technical decision from source content.';
      for (const rPattern of RATIONALE_MARKERS) {
        const rMatch = combined.match(rPattern);
        if (rMatch && rMatch[1]) {
          rationale = rMatch[1].trim();
          break;
        }
      }

      // Infer keywords and components
      const lower = combined.toLowerCase();
      const detectedComponents = COMPONENT_HINTS.filter((c) => lower.includes(c));
      const words = statement
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 4 && !['decision', 'standard', 'standardize'].includes(w));
      const keywords = [...new Set([...detectedComponents, ...words])].slice(0, 5);

      const contentHash = computeContentHash(matchedQuote || statement);

      const proposal: DecisionProposal = {
        statement: statement.replace(/^[:-]\s*/, '').trim(),
        rationale,
        owner: null,
        scope: normalizeDecisionScope({
          projectIds: context.projectId ? [context.projectId] : [],
          components: detectedComponents,
          labels: context.spaceKey ? [context.spaceKey.toLowerCase()] : [],
          keywords,
          codePaths: [],
        }),
        source: {
          type: context.type,
          id: context.id,
          url: context.url,
          quotedExcerpt: matchedQuote || statement,
          contentHash,
        },
        confidence: 0.88,
      };

      proposals.push(proposal);
    }

    return proposals;
  }
}

/**
 * Creates candidate records from proposals with idempotent keys to prevent duplicate creation
 */
export function buildIdempotentCandidates(
  proposals: readonly DecisionProposal[],
  existingCandidates: readonly Candidate[],
  now = new Date().toISOString(),
): Candidate[] {
  const existingHashes = new Set(
    existingCandidates.map((c) => `${c.proposal.source.id}:${c.proposal.source.contentHash}`),
  );

  const newCandidates: Candidate[] = [];

  for (const proposal of proposals) {
    const key = `${proposal.source.id}:${proposal.source.contentHash}`;
    if (existingHashes.has(key)) {
      continue;
    }

    existingHashes.add(key);
    newCandidates.push({
      id: `cand_${proposal.source.id}_${proposal.source.contentHash.slice(0, 8)}`,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      proposal,
      status: 'pending',
      createdAt: now,
    });
  }

  return newCandidates;
}
