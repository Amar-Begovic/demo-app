import { describe, test, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Migration Validation Tests
 * 
 * These tests validate that the Next.js 16 migration was completed correctly.
 * They check:
 * - Next.js version is 16.1.6
 * - React version is 19.2.0
 * - Build script includes Prisma migration
 * - Cache Components are enabled in next.config.ts
 * 
 * Requirements: 1.1, 1.2, 1.3, 7.1, 13.2
 */

describe("Migration Validation", () => {
  describe("package.json dependencies", () => {
    test("should have Next.js 16.1.6", () => {
      const pkg = JSON.parse(
        readFileSync(join(process.cwd(), "package.json"), "utf-8")
      );
      
      expect(pkg.dependencies.next).toBe("^16.1.6");
    });

    test("should have React 19.2.0", () => {
      const pkg = JSON.parse(
        readFileSync(join(process.cwd(), "package.json"), "utf-8")
      );
      
      expect(pkg.dependencies.react).toBe("^19.2.0");
      expect(pkg.dependencies["react-dom"]).toBe("^19.2.0");
    });
  });

  describe("package.json scripts", () => {
    test("build script should include prisma generate and next build", () => {
      const pkg = JSON.parse(
        readFileSync(join(process.cwd(), "package.json"), "utf-8")
      );
      
      expect(pkg.scripts.build).toContain("prisma generate");
      expect(pkg.scripts.build).toContain("next build");
    });
  });

  describe("next.config.ts configuration", () => {
    test("should have cacheComponents enabled", async () => {
      const configContent = readFileSync(
        join(process.cwd(), "next.config.ts"),
        "utf-8"
      );
      
      // cacheComponents should be enabled for server-side caching
      expect(configContent).toMatch(/cacheComponents:\s*true/m);
    });
  });
});
