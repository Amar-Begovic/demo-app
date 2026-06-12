import { describe, test, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * Unit tests za async Request APIs migration (Task 11.2)
 * 
 * Validates Requirements 2.6, 2.7:
 * - 2.6: FOR ALL page.tsx fajlova u app direktorijumu, params i searchParams MUST biti awaited
 * - 2.7: FOR ALL route.ts fajlova u app/api direktorijumu, cookies(), headers(), i draftMode() MUST biti awaited
 */

describe("Async Request APIs Migration", () => {
  /**
   * Rekurzivno pronalazi sve fajlove sa određenim imenom u direktorijumu
   */
  function findFiles(dir: string, filename: string): string[] {
    const results: string[] = [];
    
    try {
      const files = readdirSync(dir);
      
      for (const file of files) {
        const filePath = join(dir, file);
        
        try {
          const stat = statSync(filePath);
          
          if (stat.isDirectory()) {
            // Rekurzivno pretraži poddirektorijume
            results.push(...findFiles(filePath, filename));
          } else if (file === filename) {
            results.push(filePath);
          }
        } catch {
          // Ignoriši fajlove/direktorijume koji ne mogu biti pristupljeni
          continue;
        }
      }
    } catch {
      // Ignoriši direktorijume koji ne mogu biti pristupljeni
    }
    
    return results;
  }

  describe("Page Components (page.tsx)", () => {
    test("svi page.tsx fajlovi u app direktorijumu koriste async params pattern", () => {
      const appDir = join(process.cwd(), "app");
      const pageFiles = findFiles(appDir, "page.tsx");
      
      expect(pageFiles.length).toBeGreaterThan(0);
      
      const violations: string[] = [];
      
      for (const filePath of pageFiles) {
        const content = readFileSync(filePath, "utf-8");
        
        // Provjeri da li je "use client" komponenta
        const isClientComponent = content.includes('"use client"') || content.includes("'use client'");
        
        if (isClientComponent) {
          // Client komponente koriste useParams() hook, ne async params
          // Provjeri da li koristi useParams() ako pristupa route params
          // Ignoriši URLSearchParams i druge lokalne params varijable
          const usesRouteParams = /const\s+params\s*=\s*useParams(?:<[^>]+>)?\(\)/m.test(content);
          // Match route param access like params.id, params.slug, but NOT URLSearchParams methods
          const accessesRouteParams = /params\.(id|slug)\b/m.test(content);
          
          if (accessesRouteParams && !usesRouteParams) {
            violations.push(
              `${filePath}: Client komponenta pristupa route params ali ne koristi useParams() hook`
            );
          }
        } else {
          // Server komponente moraju koristiti async params
          // Provjeri da li funkcija prima params prop
          const hasParamsInProps = /function\s+\w+\s*\(\s*\{[^}]*params[^}]*\}/m.test(content);
          
          if (hasParamsInProps) {
            // Provjeri da li params je Promise type
            const hasPromiseParams = /params\s*:\s*Promise</m.test(content);
            
            // Provjeri da li se params await-uje
            const hasAwaitParams = /await\s+params/m.test(content);
            
            if (!hasPromiseParams && !hasAwaitParams) {
              violations.push(
                `${filePath}: Server komponenta prima params ali ne koristi Promise<params> type ili await params`
              );
            }
          }
          
          // Provjeri searchParams
          const hasSearchParamsInProps = /function\s+\w+\s*\(\s*\{[^}]*searchParams[^}]*\}/m.test(content);
          
          if (hasSearchParamsInProps) {
            const hasPromiseSearchParams = /searchParams\s*:\s*Promise</m.test(content);
            const hasAwaitSearchParams = /await\s+searchParams/m.test(content);
            
            if (!hasPromiseSearchParams && !hasAwaitSearchParams) {
              violations.push(
                `${filePath}: Server komponenta prima searchParams ali ne koristi Promise<searchParams> type ili await searchParams`
              );
            }
          }
        }
      }
      
      if (violations.length > 0) {
        throw new Error(
          `Pronađeno ${violations.length} page.tsx fajlova koji ne koriste async params pattern:\n` +
          violations.join("\n")
        );
      }
    });
  });

  describe("API Routes (route.ts)", () => {
    test("svi route.ts fajlovi u app/api koriste await za params", () => {
      const apiDir = join(process.cwd(), "app", "api");
      const routeFiles = findFiles(apiDir, "route.ts");
      
      expect(routeFiles.length).toBeGreaterThan(0);
      
      const violations: string[] = [];
      
      for (const filePath of routeFiles) {
        const content = readFileSync(filePath, "utf-8");
        
        // Provjeri da li route handler prima params u context
        const hasParamsInContext = /\{\s*params\s*\}\s*:\s*\{[^}]*params\s*:/m.test(content);
        
        if (hasParamsInContext) {
          // Provjeri da li params je Promise type
          const hasPromiseParams = /params\s*:\s*Promise</m.test(content);
          
          // Provjeri da li se params await-uje
          const hasAwaitParams = /await\s+params/m.test(content);
          
          if (!hasPromiseParams || !hasAwaitParams) {
            violations.push(
              `${filePath}: Route handler prima params ali ne koristi Promise<params> type ili await params`
            );
          }
        }
      }
      
      if (violations.length > 0) {
        throw new Error(
          `Pronađeno ${violations.length} route.ts fajlova koji ne await-uju params:\n` +
          violations.join("\n")
        );
      }
    });

    test("svi route.ts fajlovi u app/api koriste await za cookies()", () => {
      const apiDir = join(process.cwd(), "app", "api");
      const routeFiles = findFiles(apiDir, "route.ts");
      
      const violations: string[] = [];
      
      for (const filePath of routeFiles) {
        const content = readFileSync(filePath, "utf-8");
        
        // Provjeri da li se koristi cookies()
        const usesCookies = content.includes("cookies()");
        
        if (usesCookies) {
          // Provjeri da li se await-uje
          const hasAwaitCookies = /await\s+cookies\(\)/m.test(content);
          
          if (!hasAwaitCookies) {
            violations.push(
              `${filePath}: Koristi cookies() ali ne await-uje poziv`
            );
          }
        }
      }
      
      if (violations.length > 0) {
        throw new Error(
          `Pronađeno ${violations.length} route.ts fajlova koji ne await-uju cookies():\n` +
          violations.join("\n")
        );
      }
    });

    test("svi route.ts fajlovi u app/api koriste await za headers()", () => {
      const apiDir = join(process.cwd(), "app", "api");
      const routeFiles = findFiles(apiDir, "route.ts");
      
      const violations: string[] = [];
      
      for (const filePath of routeFiles) {
        const content = readFileSync(filePath, "utf-8");
        
        // Provjeri da li se koristi headers()
        const usesHeaders = content.includes("headers()");
        
        if (usesHeaders) {
          // Provjeri da li se await-uje
          const hasAwaitHeaders = /await\s+headers\(\)/m.test(content);
          
          if (!hasAwaitHeaders) {
            violations.push(
              `${filePath}: Koristi headers() ali ne await-uje poziv`
            );
          }
        }
      }
      
      if (violations.length > 0) {
        throw new Error(
          `Pronađeno ${violations.length} route.ts fajlova koji ne await-uju headers():\n` +
          violations.join("\n")
        );
      }
    });

    test("svi route.ts fajlovi u app/api koriste await za draftMode()", () => {
      const apiDir = join(process.cwd(), "app", "api");
      const routeFiles = findFiles(apiDir, "route.ts");
      
      const violations: string[] = [];
      
      for (const filePath of routeFiles) {
        const content = readFileSync(filePath, "utf-8");
        
        // Provjeri da li se koristi draftMode()
        const usesDraftMode = content.includes("draftMode()");
        
        if (usesDraftMode) {
          // Provjeri da li se await-uje
          const hasAwaitDraftMode = /await\s+draftMode\(\)/m.test(content);
          
          if (!hasAwaitDraftMode) {
            violations.push(
              `${filePath}: Koristi draftMode() ali ne await-uje poziv`
            );
          }
        }
      }
      
      if (violations.length > 0) {
        throw new Error(
          `Pronađeno ${violations.length} route.ts fajlova koji ne await-uju draftMode():\n` +
          violations.join("\n")
        );
      }
    });
  });

  describe("Integration - Comprehensive Check", () => {
    test("nema neawaited async Request APIs u cijelom projektu", () => {
      const appDir = join(process.cwd(), "app");
      const allTsFiles: string[] = [];
      
      // Pronađi sve .ts i .tsx fajlove
      function findTsFiles(dir: string): void {
        try {
          const files = readdirSync(dir);
          
          for (const file of files) {
            const filePath = join(dir, file);
            
            try {
              const stat = statSync(filePath);
              
              if (stat.isDirectory()) {
                findTsFiles(filePath);
              } else if (file.endsWith(".ts") || file.endsWith(".tsx")) {
                allTsFiles.push(filePath);
              }
            } catch {
              continue;
            }
          }
        } catch {
          // Ignoriši direktorijume koji ne mogu biti pristupljeni
        }
      }
      
      findTsFiles(appDir);
      
      const violations: string[] = [];
      
      for (const filePath of allTsFiles) {
        const content = readFileSync(filePath, "utf-8");
        
        // Skip client components za params check
        const isClientComponent = content.includes('"use client"') || content.includes("'use client'");
        
        // Provjeri za neawaited cookies() - samo u API routes
        if (filePath.includes("/api/") && filePath.endsWith("route.ts")) {
          if (content.includes("cookies()") && !content.match(/await\s+cookies\(\)/)) {
            violations.push(`${filePath}: cookies() nije awaited`);
          }
          
          if (content.includes("headers()") && !content.match(/await\s+headers\(\)/)) {
            violations.push(`${filePath}: headers() nije awaited`);
          }
          
          if (content.includes("draftMode()") && !content.match(/await\s+draftMode\(\)/)) {
            violations.push(`${filePath}: draftMode() nije awaited`);
          }
        }
        
        // Provjeri za params u route handlers
        if (filePath.includes("/api/") && filePath.endsWith("route.ts")) {
          if (content.match(/\{\s*params\s*\}\s*:\s*\{[^}]*params\s*:/)) {
            if (!content.match(/await\s+params/)) {
              violations.push(`${filePath}: params nije awaited u route handler`);
            }
          }
        }
        
        // Provjeri za params u server page components
        if (filePath.endsWith("page.tsx") && !isClientComponent) {
          if (content.match(/function\s+\w+\s*\(\s*\{[^}]*params[^}]*\}/)) {
            if (!content.match(/await\s+params/) && !content.match(/params\s*:\s*Promise</)) {
              violations.push(`${filePath}: params nije awaited u server page component`);
            }
          }
        }
      }
      
      if (violations.length > 0) {
        throw new Error(
          `Pronađeno ${violations.length} fajlova sa neawaited async Request APIs:\n` +
          violations.join("\n")
        );
      }
    });
  });
});
