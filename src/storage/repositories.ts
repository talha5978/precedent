import { kvs, WhereConditions } from '@forge/kvs';
import {
  parseAuditLog,
  parseCandidate,
  parseDecision,
  parseDecisionRelation,
  parseFeedback,
  migrateSettings,
  parseResolution,
  parseSettings,
  parseVerdict,
  type AuditLog,
  type Candidate,
  type Decision,
  type DecisionRelation,
  type Feedback,
  type Resolution,
  type Settings,
  type Verdict,
} from '../domain/models';

const STORAGE_PREFIX = 'precedent:v1';
const PAGE_SIZE_MAX = 100;

export class InvalidStoredRecordError extends Error {
  readonly code = 'INVALID_STORED_RECORD';

  constructor(collection: string, id: string) {
    super(`Stored ${collection} record "${id}" is invalid or uses an unsupported schema version.`);
    this.name = 'InvalidStoredRecordError';
  }
}

export type RepositoryPage<T> = {
  items: T[];
  nextCursor?: string;
};

export type ListOptions = {
  cursor?: string;
  limit?: number;
};

export interface RecordRepository<T extends { id: string }> {
  get(id: string): Promise<T | undefined>;
  put(record: T): Promise<void>;
  delete(id: string): Promise<void>;
  list(options?: ListOptions): Promise<RepositoryPage<T>>;
}

type Parser<T> = (value: unknown) => T | undefined;

function encodeId(id: string): string {
  if (!id.trim()) throw new Error('Record IDs must not be empty.');
  return encodeURIComponent(id);
}

function decodeId(key: string, prefix: string): string {
  try {
    return decodeURIComponent(key.slice(prefix.length));
  } catch {
    throw new InvalidStoredRecordError(prefix, key);
  }
}

function requireParsed<T>(collection: string, id: string, value: unknown, parse: Parser<T>): T {
  const record = parse(value);
  if (!record) throw new InvalidStoredRecordError(collection, id);
  return record;
}

function createRecordRepository<T extends { id: string }>(
  collection: string,
  parse: Parser<T>,
): RecordRepository<T> {
  const prefix = `${STORAGE_PREFIX}:${collection}:`;
  const keyFor = (id: string) => `${prefix}${encodeId(id)}`;

  return {
    async get(id) {
      const value = await kvs.get<unknown>(keyFor(id));
      return value === undefined ? undefined : requireParsed(collection, id, value, parse);
    },

    async put(record) {
      const validated = requireParsed(collection, record.id, record, parse);
      await kvs.set(keyFor(record.id), validated);
    },

    async delete(id) {
      await kvs.delete(keyFor(id));
    },

    async list(options = {}) {
      const requestedLimit = options.limit ?? PAGE_SIZE_MAX;
      const limit = Math.max(1, Math.min(PAGE_SIZE_MAX, Math.floor(requestedLimit)));
      const query = kvs
        .query()
        .where('key', WhereConditions.beginsWith(prefix))
        .limit(limit);
      if (options.cursor) query.cursor(options.cursor);

      const page = await query.getMany<unknown>();
      const items = page.results.map(({ key, value }) => {
        const id = decodeId(key, prefix);
        const record = requireParsed(collection, id, value, parse);
        if (record.id !== id) throw new InvalidStoredRecordError(collection, id);
        return record;
      });

      return { items, nextCursor: page.nextCursor };
    },
  };
}

export const decisions: RecordRepository<Decision> = createRecordRepository('decisions', parseDecision);
export const relations: RecordRepository<DecisionRelation> = createRecordRepository(
  'relations',
  parseDecisionRelation,
);
export const candidates: RecordRepository<Candidate> = createRecordRepository(
  'candidates',
  parseCandidate,
);
export const verdicts: RecordRepository<Verdict> = createRecordRepository('verdicts', parseVerdict);
export const resolutions: RecordRepository<Resolution> = createRecordRepository(
  'resolutions',
  parseResolution,
);
export const feedback: RecordRepository<Feedback> = createRecordRepository('feedback', parseFeedback);
export const auditLogs: RecordRepository<AuditLog> = createRecordRepository('audit-logs', parseAuditLog);

const SETTINGS_KEY = `${STORAGE_PREFIX}:settings:global`;
const LEGACY_SETTINGS_KEY = 'settings:setup';

export const settingsRepository = {
  async get(): Promise<Settings | undefined> {
    const current = await kvs.get<unknown>(SETTINGS_KEY);
    if (current !== undefined) {
      return requireParsed('settings', 'global', current, parseSettings);
    }

    const legacy = await kvs.get<unknown>(LEGACY_SETTINGS_KEY);
    if (legacy === undefined) return undefined;
    const migrated = migrateSettings(legacy);
    if (!migrated) throw new InvalidStoredRecordError('settings', 'legacy-setup');

    // Write the new record before deleting the old one, so a failed write cannot lose scope.
    await kvs.set(SETTINGS_KEY, migrated);
    await kvs.delete(LEGACY_SETTINGS_KEY);
    return migrated;
  },

  async put(settings: Settings): Promise<void> {
    await kvs.set(SETTINGS_KEY, requireParsed('settings', 'global', settings, parseSettings));
  },
};
