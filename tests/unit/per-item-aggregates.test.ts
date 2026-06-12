import { describe, it, expect } from "vitest";
import {
  getHighestPriority,
  getEarliestDeadline,
  anyItemHasNotes,
} from "@/lib/utils/calculations";

// Feature: per-item-order-details — Unit tests for aggregate utility functions

describe("getHighestPriority", () => {
  it("returns 'normal' for an empty array", () => {
    expect(getHighestPriority([])).toBe("normal");
  });

  it("returns 'urgent' if any item has urgent", () => {
    const items = [
      { priority: "low" },
      { priority: "urgent" },
      { priority: "normal" },
    ];
    expect(getHighestPriority(items)).toBe("urgent");
  });

  it("returns 'normal' if no urgent but has normal", () => {
    const items = [{ priority: "low" }, { priority: "normal" }];
    expect(getHighestPriority(items)).toBe("normal");
  });

  it("returns 'low' if all items are low", () => {
    const items = [{ priority: "low" }, { priority: "low" }];
    expect(getHighestPriority(items)).toBe("low");
  });

  it("returns 'urgent' for a single urgent item", () => {
    expect(getHighestPriority([{ priority: "urgent" }])).toBe("urgent");
  });

  it("returns 'normal' for a single normal item", () => {
    expect(getHighestPriority([{ priority: "normal" }])).toBe("normal");
  });

  it("returns 'low' for a single low item", () => {
    expect(getHighestPriority([{ priority: "low" }])).toBe("low");
  });
});

describe("getEarliestDeadline", () => {
  it("returns null for an empty array", () => {
    expect(getEarliestDeadline([])).toBeNull();
  });

  it("returns null if all items have null deadline", () => {
    const items = [
      { deliveryDeadline: null },
      { deliveryDeadline: null },
    ];
    expect(getEarliestDeadline(items)).toBeNull();
  });

  it("returns the only non-null deadline", () => {
    const date = new Date("2025-03-15");
    const items = [
      { deliveryDeadline: null },
      { deliveryDeadline: date },
    ];
    expect(getEarliestDeadline(items)).toEqual(date);
  });

  it("returns the earliest date among multiple", () => {
    const early = new Date("2025-01-01");
    const late = new Date("2025-06-01");
    const items = [
      { deliveryDeadline: late },
      { deliveryDeadline: early },
      { deliveryDeadline: null },
    ];
    expect(getEarliestDeadline(items)).toEqual(early);
  });

  it("handles a single item with a deadline", () => {
    const date = new Date("2025-05-20");
    expect(getEarliestDeadline([{ deliveryDeadline: date }])).toEqual(date);
  });
});

describe("anyItemHasNotes", () => {
  it("returns false for an empty array", () => {
    expect(anyItemHasNotes([])).toBe(false);
  });

  it("returns false if all items have null notes", () => {
    const items = [{ notes: null }, { notes: null }];
    expect(anyItemHasNotes(items)).toBe(false);
  });

  it("returns false if all items have empty string notes", () => {
    const items = [{ notes: "" }, { notes: "" }];
    expect(anyItemHasNotes(items)).toBe(false);
  });

  it("returns true if any item has non-empty notes", () => {
    const items = [{ notes: null }, { notes: "Important" }];
    expect(anyItemHasNotes(items)).toBe(true);
  });

  it("returns true for a single item with notes", () => {
    expect(anyItemHasNotes([{ notes: "Note" }])).toBe(true);
  });

  it("returns false for mixed null and empty string notes", () => {
    const items = [{ notes: null }, { notes: "" }];
    expect(anyItemHasNotes(items)).toBe(false);
  });
});
