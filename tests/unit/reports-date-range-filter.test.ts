import { test as fcTest, fc } from "@fast-check/vitest";
import { describe, it, expect } from "vitest";
import {
  getPresetDateRange,
  getMonday,
  isValidDateRange,
  buildDateFilter,
  parseDateParam,
  formatDateToISO,
  type PresetKey,
} from "@/lib/utils/filter-helpers";

// Feature: reports-date-range-filter, Property 1: Preset date ranges are valid and correct
// **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
describe("Property 1: Preset date ranges are valid and correct", () => {
  const presetArb = fc.constantFrom<PresetKey>(
    "today",
    "this_week",
    "this_month",
    "last_30_days"
  );
  // Generate valid dates in a reasonable range
  const dateArb = fc
    .date({
      min: new Date("2000-01-01T00:00:00"),
      max: new Date("2099-12-31T00:00:00"),
    })
    .filter((d) => !isNaN(d.getTime()));

  fcTest.prop([presetArb, dateArb], { numRuns: 100 })(
    "dateFrom and dateTo are valid YYYY-MM-DD and dateFrom <= dateTo",
    (preset, date) => {
      const range = getPresetDateRange(preset, date);
      // Valid YYYY-MM-DD format
      expect(range.dateFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(range.dateTo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // dateFrom <= dateTo
      expect(range.dateFrom <= range.dateTo).toBe(true);
    }
  );

  fcTest.prop([dateArb], { numRuns: 100 })(
    "today preset: dateFrom === dateTo === formatted date",
    (date) => {
      const range = getPresetDateRange("today", date);
      const expected = formatDateToISO(date);
      expect(range.dateFrom).toBe(expected);
      expect(range.dateTo).toBe(expected);
    }
  );

  fcTest.prop([dateArb], { numRuns: 100 })(
    "this_week preset: dateFrom is a Monday and dateFrom <= dateTo",
    (date) => {
      const range = getPresetDateRange("this_week", date);
      const monday = new Date(range.dateFrom + "T00:00:00");
      expect(monday.getDay()).toBe(1); // Monday
      expect(range.dateTo).toBe(formatDateToISO(date));
      expect(range.dateFrom <= range.dateTo).toBe(true);
    }
  );

  fcTest.prop([dateArb], { numRuns: 100 })(
    "this_month preset: dateFrom ends with -01 and same year-month as dateTo",
    (date) => {
      const range = getPresetDateRange("this_month", date);
      expect(range.dateFrom).toMatch(/-01$/);
      expect(range.dateFrom.slice(0, 7)).toBe(range.dateTo.slice(0, 7));
      expect(range.dateTo).toBe(formatDateToISO(date));
    }
  );

  fcTest.prop([dateArb], { numRuns: 100 })(
    "last_30_days preset: difference is exactly 30 days",
    (date) => {
      const range = getPresetDateRange("last_30_days", date);
      const from = new Date(range.dateFrom + "T00:00:00");
      const to = new Date(range.dateTo + "T00:00:00");
      const diffMs = to.getTime() - from.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(30);
      expect(range.dateTo).toBe(formatDateToISO(date));
    }
  );
});

// Feature: reports-date-range-filter, Property 2: Invalid date ranges are rejected
// **Validates: Requirements 3.4**
describe("Property 2: Invalid date ranges are rejected", () => {
  // Generate valid YYYY-MM-DD date strings
  const dateStrArb = fc
    .date({
      min: new Date("2000-01-01T00:00:00"),
      max: new Date("2099-12-31T00:00:00"),
    })
    .filter((d) => !isNaN(d.getTime()))
    .map((d) => formatDateToISO(d));

  fcTest.prop([dateStrArb, dateStrArb], { numRuns: 100 })(
    "isValidDateRange returns false when dateFrom > dateTo, true when dateFrom <= dateTo",
    (a, b) => {
      if (a > b) {
        expect(isValidDateRange(a, b)).toBe(false);
      } else {
        expect(isValidDateRange(a, b)).toBe(true);
      }
    }
  );
});

// Feature: reports-date-range-filter, Property 3: Date filter includes dates within range
// **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4**
describe("Property 3: Date filter includes dates within range", () => {
  const dateStrArb = fc
    .date({
      min: new Date("2000-01-01T00:00:00"),
      max: new Date("2099-12-31T00:00:00"),
    })
    .filter((d) => !isNaN(d.getTime()))
    .map((d) => formatDateToISO(d));

  // Generate an ordered pair (dateFrom <= dateTo)
  const orderedPairArb = fc
    .tuple(dateStrArb, dateStrArb)
    .map(([a, b]) => (a <= b ? [a, b] : [b, a]) as [string, string]);

  // A random date to test inclusion
  const testDateArb = fc
    .date({
      min: new Date("2000-01-01T00:00:00"),
      max: new Date("2099-12-31T00:00:00"),
    })
    .filter((d) => !isNaN(d.getTime()));

  fcTest.prop([orderedPairArb, testDateArb], { numRuns: 100 })(
    "buildDateFilter includes date d iff dateFrom <= d <= dateTo (end of day)",
    ([dateFrom, dateTo], testDate) => {
      const filter = buildDateFilter(dateFrom, dateTo);
      expect(filter).not.toBeNull();

      const dStr = formatDateToISO(testDate);
      const inRange = dStr >= dateFrom && dStr <= dateTo;

      // Check if testDate passes the filter
      const passesGte = !filter!.gte || testDate >= filter!.gte;
      // For lte, the filter uses end of day, so any time on dateTo passes
      const passesLte = !filter!.lte || testDate <= filter!.lte;
      const passesFilter = passesGte && passesLte;

      expect(passesFilter).toBe(inRange);
    }
  );

  it("returns null when both params are null", () => {
    expect(buildDateFilter(null, null)).toBeNull();
  });
});

// Feature: reports-date-range-filter, Property 4: Date parameter validation
// **Validates: Requirements 4.5, 5.5**
describe("Property 4: Date parameter validation", () => {
  // Valid YYYY-MM-DD strings
  const validDateStrArb = fc
    .date({
      min: new Date("2000-01-01T00:00:00"),
      max: new Date("2099-12-31T00:00:00"),
    })
    .filter((d) => !isNaN(d.getTime()))
    .map((d) => formatDateToISO(d));

  fcTest.prop([validDateStrArb], { numRuns: 100 })(
    "parseDateParam returns non-null for valid YYYY-MM-DD strings",
    (dateStr) => {
      const result = parseDateParam(dateStr);
      expect(result).not.toBeNull();
      expect(result).toBeInstanceOf(Date);
      expect(formatDateToISO(result!)).toBe(dateStr);
    }
  );

  // Arbitrary strings that are unlikely to be valid dates
  const invalidStrArb = fc.oneof(
    fc.constant("not-a-date"),
    fc.constant(""),
    fc.constant("2025-02-30"),
    fc.constant("2025-13-01"),
    fc.constant("2025-00-15"),
    fc.constant("abcd-ef-gh"),
    fc.constant("2025/01/15"),
    fc.constant("01-15-2025"),
    fc.constant("2025-1-5"),
    // Random strings
    fc.string().filter((s) => !/^\d{4}-\d{2}-\d{2}$/.test(s))
  );

  fcTest.prop([invalidStrArb], { numRuns: 100 })(
    "parseDateParam returns null for invalid strings",
    (str) => {
      const result = parseDateParam(str);
      if (result !== null) {
        // If it returned non-null, the string must be a valid YYYY-MM-DD calendar date
        expect(str.trim()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(formatDateToISO(result)).toBe(str.trim());
      }
    }
  );
});

// Feature: reports-date-range-filter — Unit tests for preset edge cases
describe("Unit tests: preset edge cases", () => {
  it("today preset for 2025-01-15 → dateFrom === dateTo === '2025-01-15'", () => {
    const date = new Date("2025-01-15T12:00:00");
    const range = getPresetDateRange("today", date);
    expect(range.dateFrom).toBe("2025-01-15");
    expect(range.dateTo).toBe("2025-01-15");
  });

  it("this_week preset for Sunday → dateFrom is previous Monday", () => {
    // 2025-01-19 is a Sunday
    const sunday = new Date("2025-01-19T12:00:00");
    const range = getPresetDateRange("this_week", sunday);
    expect(range.dateFrom).toBe("2025-01-13"); // Monday
    expect(range.dateTo).toBe("2025-01-19");
  });

  it("this_week preset for Monday → dateFrom === dateTo", () => {
    // 2025-01-13 is a Monday
    const monday = new Date("2025-01-13T12:00:00");
    const range = getPresetDateRange("this_week", monday);
    expect(range.dateFrom).toBe("2025-01-13");
    expect(range.dateTo).toBe("2025-01-13");
  });

  it("this_month preset for first day of month → dateFrom === dateTo", () => {
    const firstDay = new Date("2025-03-01T12:00:00");
    const range = getPresetDateRange("this_month", firstDay);
    expect(range.dateFrom).toBe("2025-03-01");
    expect(range.dateTo).toBe("2025-03-01");
  });

  it("last_30_days preset for 2025-01-31 → dateFrom is 2025-01-01", () => {
    const date = new Date("2025-01-31T12:00:00");
    const range = getPresetDateRange("last_30_days", date);
    expect(range.dateFrom).toBe("2025-01-01");
    expect(range.dateTo).toBe("2025-01-31");
  });

  it("buildDateFilter(null, null) → returns null", () => {
    expect(buildDateFilter(null, null)).toBeNull();
  });

  it("buildDateFilter('2025-01-01', null) → only gte", () => {
    const filter = buildDateFilter("2025-01-01", null);
    expect(filter).not.toBeNull();
    expect(filter!.gte).toEqual(new Date("2025-01-01T00:00:00"));
    expect(filter!.lte).toBeUndefined();
  });

  it("buildDateFilter(null, '2025-01-31') → only lte", () => {
    const filter = buildDateFilter(null, "2025-01-31");
    expect(filter).not.toBeNull();
    expect(filter!.gte).toBeUndefined();
    expect(filter!.lte).toEqual(new Date("2025-01-31T23:59:59.999"));
  });

  it("parseDateParam('not-a-date') → null", () => {
    expect(parseDateParam("not-a-date")).toBeNull();
  });

  it("parseDateParam('2025-02-30') → null (invalid calendar date)", () => {
    expect(parseDateParam("2025-02-30")).toBeNull();
  });

  it("parseDateParam('') → null", () => {
    expect(parseDateParam("")).toBeNull();
  });

  it("getMonday returns the same date when given a Monday", () => {
    const monday = new Date("2025-01-13T12:00:00");
    const result = getMonday(monday);
    expect(formatDateToISO(result)).toBe("2025-01-13");
  });

  it("getMonday returns previous Monday for a Wednesday", () => {
    const wednesday = new Date("2025-01-15T12:00:00");
    const result = getMonday(wednesday);
    expect(formatDateToISO(result)).toBe("2025-01-13");
  });
});
