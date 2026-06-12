import { describe, it, expect } from "vitest";
import { parseArticleWidth } from "../../lib/utils/bed-label-helpers";

describe("parseArticleWidth", () => {
  describe("parsing from dimensions field", () => {
    it('parses "120x200" → 120', () => {
      expect(parseArticleWidth("120x200")).toBe(120);
    });

    it('parses "90X190" (uppercase X) → 90', () => {
      expect(parseArticleWidth("90X190")).toBe(90);
    });

    it('parses "160 x 200" (spaces around x) → 160', () => {
      expect(parseArticleWidth("160 x 200")).toBe(160);
    });

    it('parses "80x190" → 80', () => {
      expect(parseArticleWidth("80x190")).toBe(80);
    });
  });

  describe("fallback to articleName", () => {
    it('parses width from "ADORA 120X200 krevet" → 120', () => {
      expect(parseArticleWidth(null, "ADORA 120X200 krevet")).toBe(120);
    });

    it('parses width from "Krevet 90x200 + madrac" → 90', () => {
      expect(parseArticleWidth(null, "Krevet 90x200 + madrac")).toBe(90);
    });

    it("uses articleName when dimensions is empty string", () => {
      expect(parseArticleWidth("", "BAZA 160x200")).toBe(160);
    });

    it("uses articleName when dimensions is undefined", () => {
      expect(parseArticleWidth(undefined, "Model 140X200")).toBe(140);
    });
  });

  describe("returns null when no pattern found", () => {
    it("returns null for null dimensions and no articleName", () => {
      expect(parseArticleWidth(null)).toBeNull();
    });

    it("returns null for null dimensions and null articleName", () => {
      expect(parseArticleWidth(null, null)).toBeNull();
    });

    it("returns null when articleName has no dimension pattern", () => {
      expect(parseArticleWidth(null, "No dimensions here")).toBeNull();
    });

    it("returns null for empty dimensions and empty articleName", () => {
      expect(parseArticleWidth("", "")).toBeNull();
    });
  });

  describe("dimensions takes priority over articleName", () => {
    it("uses dimensions when both are provided", () => {
      expect(parseArticleWidth("120x200", "ADORA 160X200 krevet")).toBe(120);
    });

    it("falls back to articleName when dimensions doesn't match pattern", () => {
      expect(parseArticleWidth("invalid", "Model 90x190")).toBe(90);
    });
  });
});
