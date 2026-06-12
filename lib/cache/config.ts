export type CacheLifeProfile = "max" | "hours" | "days";

export interface CacheConfig {
  profile: CacheLifeProfile;
  tags: string[];
  revalidate?: number;
}

// Cache duration in seconds
export const CACHE_PROFILES: Record<CacheLifeProfile, number> = {
  max: 31536000,  // 1 year - for rarely changing data
  hours: 3600,    // 1 hour - for frequently changing data
  days: 86400,    // 1 day - for moderately changing data
};

// Cache tags constants
export const CACHE_TAGS = {
  // Global resource tags
  ARTICLES: "articles",
  MATERIALS: "materials",
  PRODUCTION_ORDERS: "production-orders",
  WORK_ORDERS: "work-orders",
  DEPARTMENTS: "departments",
  SUPPLIERS: "suppliers",
  FABRICS: "fabrics",
  
  // Granular tag generators
  article: (id: string) => `article-${id}`,
  material: (id: string) => `material-${id}`,
  productionOrder: (id: string) => `production-order-${id}`,
  workOrder: (id: string) => `work-order-${id}`,
  department: (id: string) => `department-${id}`,
  supplier: (id: string) => `supplier-${id}`,
  fabric: (id: string) => `fabric-${id}`,
} as const;

// Resource-specific cache configurations
export const RESOURCE_CACHE_CONFIG: Record<string, CacheConfig> = {
  departments: {
    profile: "max",
    tags: [CACHE_TAGS.DEPARTMENTS],
  },
  suppliers: {
    profile: "max",
    tags: [CACHE_TAGS.SUPPLIERS],
  },
  articles: {
    profile: "days",
    tags: [CACHE_TAGS.ARTICLES],
  },
  materials: {
    profile: "days",
    tags: [CACHE_TAGS.MATERIALS],
  },
  fabrics: {
    profile: "days",
    tags: [CACHE_TAGS.FABRICS],
  },
  productionOrders: {
    profile: "hours",
    tags: [CACHE_TAGS.PRODUCTION_ORDERS],
  },
  workOrders: {
    profile: "hours",
    tags: [CACHE_TAGS.WORK_ORDERS],
  },
};
