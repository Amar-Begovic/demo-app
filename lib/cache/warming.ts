// lib/cache/warming.ts

import { CACHE_TAGS } from "./config";

export class CacheWarmer {
  /**
   * Warm critical resources on application startup
   */
  static async warmCriticalResources(): Promise<void> {
    if (process.env.NODE_ENV === "production") {
      console.log("🔥 Starting cache warming...");
      
      try {
        // Warm departments (rarely change, frequently accessed)
        await this.warmResource("/api/departments", CACHE_TAGS.DEPARTMENTS);
        
        // Warm suppliers (rarely change, frequently accessed)
        await this.warmResource("/api/suppliers", CACHE_TAGS.SUPPLIERS);
        
        console.log("✅ Cache warming completed");
      } catch (error) {
        console.error("❌ Cache warming failed:", error);
        // Don't throw - warming failure shouldn't prevent app startup
      }
    }
  }
  
  private static async warmResource(url: string, tag: string): Promise<void> {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}${url}`);
      if (response.ok) {
        console.log(`✅ Warmed cache for: ${tag}`);
      } else {
        console.warn(`⚠️ Failed to warm cache for: ${tag}`);
      }
    } catch (error) {
      console.error(`❌ Error warming cache for ${tag}:`, error);
    }
  }
  
  /**
   * Custom warming logic for specific use cases
   */
  static async warmCustom(fetchFn: () => Promise<void>, tag: string): Promise<void> {
    try {
      await fetchFn();
      console.log(`✅ Custom cache warmed for: ${tag}`);
    } catch (error) {
      console.error(`❌ Custom cache warming failed for ${tag}:`, error);
    }
  }
}
