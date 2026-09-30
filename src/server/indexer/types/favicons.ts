export interface FaviconRow {
  key: string;
  mime: string | null;
  data: Uint8Array | null;
  fetchedAt: number;
}

export interface FaviconStoreStats {
  rows: number;
  negative: number;
  bytes: number;
}

export interface FaviconStore {
  init(): Promise<void>;
  get(key: string): Promise<FaviconRow | null>;
  put(row: FaviconRow): Promise<void>;
  delete(key: string): Promise<void>;
  prune(maxAgeDays: number): Promise<number>;
  stats(): Promise<FaviconStoreStats>;
  close(): Promise<void>;
}

export const NEGATIVE_ROW_MAX_AGE_DAYS = 1;
export const DAY_MS = 24 * 60 * 60 * 1000;

export const pruneCutoffs = (
  maxAgeDays: number,
  now: number,
): { positive: number; negative: number } => ({
  positive: now - maxAgeDays * DAY_MS,
  negative: now - Math.min(maxAgeDays, NEGATIVE_ROW_MAX_AGE_DAYS) * DAY_MS,
});

export const isRowFresh = (row: FaviconRow, maxAgeDays: number, now: number): boolean => {
  const cutoffs = pruneCutoffs(maxAgeDays, now);
  return row.fetchedAt >= (row.data ? cutoffs.positive : cutoffs.negative);
};
