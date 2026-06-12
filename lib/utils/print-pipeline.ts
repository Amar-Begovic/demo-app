/**
 * Shared print pipeline.
 *
 * Pure, database-free composition of existing helpers from
 * `print-helpers.ts` and route-specific post-filters. Operates on
 * pre-fetched `PrintData` objects (already loaded by the caller via
 * `getPrintData`) and produces a typed, pre-render data structure per
 * Print_Type.
 *
 * The pipeline intentionally does NOT:
 *   - perform database queries (barcodes, cleanup, etc.)
 *   - generate barcode images or render labels
 *   - emit React components
 *
 * It ONLY performs the pure data transformations so that bulk and
 * single-order parity can be tested at the data level (design.md,
 * Property 11).
 *
 * Stage order (design.md, "Architecture" and Req 4.1–4.8):
 *
 *   load PrintData
 *     → filterItemsByArticle(data, articles)          // Req 4.3
 *     → sortPrintData(data, sort)                     // Req 4.7
 *     → aggregatePrintData(data)                      // Req 4.8 (only when
 *                                                     //   matrix row has
 *                                                     //   `aggregate` and
 *                                                     //   selection is true)
 *     → route-specific post-filter:                   // Req 4.5
 *         plan-utroska / print-za-odjele
 *           → buildDeptSections + filter by dept id
 *
 * Route-specific filters that depend on label-building state — the
 * `etikete` part-name filter (Req 4.4) and the `pakovanje` component
 * filter (Req 4.6) — are applied by the routes themselves when they
 * build labels (which involves barcode / DB access and is therefore
 * outside this pure pipeline). The routes consume `applied.parts` /
 * `applied.components` from `AppliedParams` directly.
 */

import {
  aggregatePrintData,
  buildDeptSections,
  filterItemsByArticle,
  sortPrintData,
  type DeptSection,
  type PrintData,
} from "./print-helpers";
import {
  APPLICABILITY_MATRIX,
  type AppliedParams,
  type PrintType,
} from "./print-applicability";

/**
 * The pre-render output of `runPipeline` / `runBulkPipeline`.
 *
 * A single shape with optional auxiliary fields (rather than a
 * discriminated union) so callers can thread one type through the rest
 * of their pipeline and only read the fields relevant to their
 * Print_Type.
 */
export interface PipelineResult {
  /**
   * Filtered (+ sorted, + aggregated where applicable) `PrintData`.
   * Downstream routes iterate `.items` and their `.parts` to render.
   */
  data: PrintData;
  /**
   * Department sections produced by `buildDeptSections`, already filtered
   * by department id when the matrix row for the Print_Type includes
   * `departments`.
   *
   * Present for `plan-utroska` and `print-za-odjele`; `undefined` for
   * every other Print_Type.
   */
  deptSections?: DeptSection[];
}

/**
 * Run the pure print pipeline for a single `PrintData` / `PrintType`
 * pair.
 *
 * Stages are composed in the fixed order documented at the top of this
 * file; each stage is a no-op when the control it honors is absent
 * from `APPLICABILITY_MATRIX[type]` or when the corresponding
 * `AppliedParams` value is empty (Req 5.1, Property 15).
 *
 * The function is pure: neither `data` nor `applied` is mutated, and
 * the result depends only on its inputs.
 *
 * Implements: Req 4.1, 4.3, 4.5, 4.7, 4.8, 5.1.
 */
export function runPipeline(
  data: PrintData,
  applied: AppliedParams,
  type: PrintType,
): PipelineResult {
  const applicable = APPLICABILITY_MATRIX[type];

  // Stage 1: article filter (Req 4.3).
  // `filterItemsByArticle` expects a mutable `Set<string>`; we clone the
  // readonly set from `AppliedParams` to honor that signature without
  // leaking mutability upstream.
  let current: PrintData =
    applicable.has("articles") && applied.articles.size > 0
      ? filterItemsByArticle(data, new Set(applied.articles))
      : data;

  // Stage 2: hierarchical sort (Req 4.7).
  // `sortPrintData` takes `SortKey[]`; convert the readonly array with a
  // shallow spread.
  if (applicable.has("sort") && applied.sort.length > 0) {
    current = sortPrintData(current, [...applied.sort]);
  }

  // Stage 3: aggregation (Req 4.8). Only applied when the matrix row
  // includes `aggregate` and the user toggled it on.
  if (applicable.has("aggregate") && applied.aggregate) {
    current = aggregatePrintData(current);
  }

  // Stage 4: route-specific post-filter.
  //
  // Only `plan-utroska` and `print-za-odjele` produce department
  // sections in this pure pipeline. The department filter (Req 4.5) is
  // applied here when the matrix row honors it.
  //
  // The `etikete` part filter (Req 4.4) and the `pakovanje` component
  // filter (Req 4.6) operate on label-building state rather than on
  // `PrintData` and are handled by their respective routes; they are
  // intentionally out of scope for this module (see file header).
  let deptSections: DeptSection[] | undefined;
  if (type === "plan-utroska" || type === "print-za-odjele") {
    const allSections = buildDeptSections(current);
    if (applicable.has("departments") && applied.departments.size > 0) {
      deptSections = allSections.filter((section) =>
        applied.departments.has(section.departmentId),
      );
    } else {
      deptSections = allSections;
    }
  }

  return { data: current, deptSections };
}

/**
 * Run the pure print pipeline for a list of `PrintData` orders.
 *
 * Returns one `PipelineResult` per input order (bulk prints emit
 * per-order sections that the bulk route concatenates). The same stage
 * order as `runPipeline` is used, with one nuance around aggregation:
 *
 *   - `aggregatePrintData` deduplicates items WITHIN a single `PrintData`
 *     (it keys on `articleId::fabricId`). Cross-order aggregation
 *     (collapsing identical articles from different orders into one row)
 *     is performed by the bulk route's `buildSummaryRows` helper when it
 *     renders the `zbirni-radni-nalog` / `summary` view — that is
 *     outside this pure module.
 *
 *   - At the pipeline level, we therefore apply aggregation per order:
 *     duplicates *within* each order collapse, which preserves parity
 *     with the single-order pipeline when the same `AppliedParams` are
 *     used (design.md, Property 11 for the `aggregate === false` case;
 *     Property 11's aggregate branch is realised by the caller over the
 *     concatenation of per-order results).
 *
 * The function is pure.
 *
 * Implements: Req 4.1, 4.2, 4.3, 4.5, 4.7, 4.8.
 */
export function runBulkPipeline(
  orders: PrintData[],
  applied: AppliedParams,
  type: PrintType,
): PipelineResult[] {
  return orders.map((order) => runPipeline(order, applied, type));
}
