import type { CacheLifeProfile } from "./config";

export interface CacheEntry {
  key: string;
  value: unknown;
  tags: string[];
  expiresAt: number; // Unix timestamp
  createdAt: number;
  profile: CacheLifeProfile;
}

export interface CacheMetadata {
  hits: number;
  misses: number;
  hitRate: number;
  totalEntries: number;
  tagDistribution: Record<string, number>;
}
