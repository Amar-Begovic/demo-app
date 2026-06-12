// lib/cache/monitoring.ts

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalEntries: number;
  tagDistribution: Record<string, number>;
}

export class CacheMonitor {
  private static stats: CacheStats = {
    hits: 0,
    misses: 0,
    hitRate: 0,
    totalEntries: 0,
    tagDistribution: {},
  };
  
  static recordHit(tag: string): void {
    this.stats.hits++;
    this.updateHitRate();
    this.updateTagDistribution(tag);
    
    if (process.env.NODE_ENV === "development") {
      console.log(`✅ Cache HIT for tag: ${tag}`);
    }
  }
  
  static recordMiss(tag: string): void {
    this.stats.misses++;
    this.updateHitRate();
    
    if (process.env.NODE_ENV === "development") {
      console.log(`❌ Cache MISS for tag: ${tag}`);
    }
  }
  
  private static updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
    
    // Warn if hit rate is low
    if (total > 100 && this.stats.hitRate < 0.5) {
      console.warn(`⚠️ Low cache hit rate: ${(this.stats.hitRate * 100).toFixed(2)}%`);
      console.warn("💡 Consider adjusting cache life profiles or warming strategy");
    }
  }
  
  private static updateTagDistribution(tag: string): void {
    this.stats.tagDistribution[tag] = (this.stats.tagDistribution[tag] || 0) + 1;
  }
  
  static getStats(): CacheStats {
    return { ...this.stats };
  }
  
  static reset(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      hitRate: 0,
      totalEntries: 0,
      tagDistribution: {},
    };
  }
}
