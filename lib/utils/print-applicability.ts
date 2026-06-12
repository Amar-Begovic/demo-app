import { parseIds, serializeIds } from "./filter-helpers";
import { parseSortParam, type SortKey } from "./print-helpers";

/**
 * Re-export `SortKey` from `print-helpers` so consumers of
 * `print-applicability.ts` only need to depend on a single module.
 */
export type { SortKey };

/**
 * The seven Print_Types supported by the print options modal and the
 * per-route pipelines. Each value corresponds to one row in
 * `APPLICABILITY_MATRIX`.
 */
export type PrintType =
  | "radni-nalog"
  | "order"
  | "plan-utroska"
  | "plan-utroska-rekapitulacija"
  | "etikete"
  | "pakovanje"
  | "zbirni-radni-nalog"
  | "print-za-odjele";

/**
 * The six user-facing filter / behavior controls that can appear in the
 * print options modal. A given Print_Type only exposes the subset listed
 * in its `APPLICABILITY_MATRIX` row.
 */
export type ControlName =
  | "articles"
  | "parts"
  | "departments"
  | "components"
  | "sort"
  | "aggregate"
  | "groupByBed"
  | "bedType"
  | "dateRange";

/**
 * Single source of truth mapping each Print_Type to the set of controls
 * it honors. The modal reads it to decide which controls to render;
 * every print route reads it to decide which query params to honor.
 *
 * See design.md, "Components and Interfaces".
 */
export const APPLICABILITY_MATRIX: Readonly<Record<PrintType, ReadonlySet<ControlName>>> = {
  "radni-nalog":        new Set<ControlName>(["articles", "sort", "dateRange"]),
  "order":              new Set<ControlName>(),
  "plan-utroska":       new Set<ControlName>(["articles", "departments", "sort", "bedType", "dateRange"]),
  "plan-utroska-rekapitulacija": new Set<ControlName>(["articles", "departments", "sort", "groupByBed", "bedType", "dateRange"]),
  "etikete":            new Set<ControlName>(["articles", "parts", "sort"]),
  "pakovanje":          new Set<ControlName>(["articles", "components", "sort"]),
  "zbirni-radni-nalog": new Set<ControlName>(["articles", "sort", "aggregate", "dateRange"]),
  "print-za-odjele":    new Set<ControlName>(["articles", "departments", "sort"]),
};

/**
 * User-facing selections held by the print options modal. Each slot maps
 * one-to-one to a `ControlName`.
 */
export interface Selections {
  articles: ReadonlySet<string>;
  parts: ReadonlySet<string>;
  departments: ReadonlySet<string>;
  components: ReadonlySet<string>;
  sort: readonly SortKey[];
  aggregate: boolean;
  groupByBed: boolean;
  bedType: "all" | "Drveni" | "Metalni";
  dateFrom: string; // YYYY-MM-DD or ""
  dateTo: string;   // YYYY-MM-DD or ""
}

/**
 * Neutral / zero value for every slot in `Selections`. Used as the initial
 * state of the modal and by `pruneNonApplicable` when resetting a slot
 * that is not in the matrix row of the current Print_Type.
 */
export const EMPTY_SELECTIONS: Selections = {
  articles: new Set<string>(),
  parts: new Set<string>(),
  departments: new Set<string>(),
  components: new Set<string>(),
  sort: [],
  aggregate: false,
  groupByBed: false,
  bedType: "all",
  dateFrom: "",
  dateTo: "",
};

/**
 * The typed, matrix-filtered view of a route's `searchParams` that each
 * print route consumes. Produced by `readPrintParams` (task 1.4).
 *
 * Structurally identical to `Selections`; the two are kept as distinct
 * types so the modal-side (pre-URL) and route-side (post-URL) flows can
 * evolve independently.
 */
export interface AppliedParams {
  articles: ReadonlySet<string>;
  parts: ReadonlySet<string>;
  departments: ReadonlySet<string>;
  components: ReadonlySet<string>;
  sort: readonly SortKey[];
  aggregate: boolean;
  groupByBed: boolean;
  bedType: "all" | "Drveni" | "Metalni";
  dateFrom: string; // YYYY-MM-DD or ""
  dateTo: string;   // YYYY-MM-DD or ""
}

/**
 * Return a new `Selections` in which every slot whose control is NOT in
 * `APPLICABILITY_MATRIX[type]` is reset to its empty value:
 *   - collection controls (`articles`, `parts`, `departments`, `components`)
 *     → empty `Set<string>`
 *   - `sort` → empty array
 *   - `aggregate` → `false`
 *
 * Slots for controls that ARE in the matrix row for `type` are preserved
 * by reference (the existing selection is copied through unchanged).
 *
 * The function is pure: it does not mutate `selections` and always
 * returns a fresh object.
 *
 * See design.md, Property 2 (discard non-applicable selections on
 * Print_Type change) and Property 3 (preserve applicable selections on
 * Print_Type change).
 */
export function pruneNonApplicable(
  selections: Selections,
  type: PrintType,
): Selections {
  const applicable = APPLICABILITY_MATRIX[type];
  return {
    articles: applicable.has("articles")
      ? selections.articles
      : EMPTY_SELECTIONS.articles,
    parts: applicable.has("parts")
      ? selections.parts
      : EMPTY_SELECTIONS.parts,
    departments: applicable.has("departments")
      ? selections.departments
      : EMPTY_SELECTIONS.departments,
    components: applicable.has("components")
      ? selections.components
      : EMPTY_SELECTIONS.components,
    sort: applicable.has("sort") ? selections.sort : EMPTY_SELECTIONS.sort,
    aggregate: applicable.has("aggregate")
      ? selections.aggregate
      : EMPTY_SELECTIONS.aggregate,
    groupByBed: applicable.has("groupByBed")
      ? selections.groupByBed
      : EMPTY_SELECTIONS.groupByBed,
    bedType: applicable.has("bedType")
      ? selections.bedType
      : EMPTY_SELECTIONS.bedType,
    dateFrom: applicable.has("dateRange")
      ? selections.dateFrom
      : EMPTY_SELECTIONS.dateFrom,
    dateTo: applicable.has("dateRange")
      ? selections.dateTo
      : EMPTY_SELECTIONS.dateTo,
  };
}

/**
 * Normalize a collection of tokens by trimming, dropping empty / whitespace-only
 * entries, and de-duplicating while preserving first-seen order. Used by
 * `buildPrintUrl` for `articles`, `parts`, `departments`, and `components`
 * selections so that duplicate / whitespace-only user input produces stable,
 * idempotent URLs (Req 6.1).
 */
function normalizeTokens(values: Iterable<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * Build the full URL for a print action.
 *
 * Route selection:
 *   - Single-order path `/production/{orderId}/print/{type}` when
 *     `orderIds.length === 1` and `summary` is not set.
 *   - Bulk summary path `/production/print/bulk?ids=...&summary=1` when
 *     `summary` is true (no `section` is emitted — summary is the bulk
 *     route's own view of the data).
 *   - Bulk path `/production/print/bulk?ids=...&section={type}` otherwise.
 *
 * Query parameter discipline (Req 2.3, 2.4, 9.1, 9.2):
 *   - Only the params listed in `APPLICABILITY_MATRIX[type]` are emitted.
 *   - A param is omitted when its selection normalizes to an empty value
 *     (empty set / empty list / `false`), which the route-side reader treats
 *     as "print everything" (Req 5.1).
 *
 * Normalization (Req 6.1):
 *   - Collection selections (`articles`, `parts`, `departments`, `components`)
 *     are de-duplicated and stripped of empty / whitespace-only tokens before
 *     serialization.
 *   - `aggregate=1` is only emitted when the matrix row for `type` contains
 *     `aggregate` and the selection is `true`; otherwise the parameter is
 *     omitted.
 *
 * Serialization format (matches design.md "Query parameter contract"):
 *   - `articles`, `components`: each token is passed through
 *     `encodeURIComponent` individually, then joined with literal commas
 *     (so commas remain as `,` and spaces become `%20`).
 *   - `parts`: same tokenwise URI-encoding. Part names are ASCII-safe in
 *     practice so the output is equivalent to a plain comma-join.
 *   - `departments`: `serializeIds(ids)` — comma-separated UUIDs.
 *   - `sort`: comma-separated sort keys in the user-selected order.
 *   - `aggregate`: `1`.
 *   - `ids` (routing): `serializeIds(orderIds)`.
 *
 * The function is pure: it does not mutate `s` or `opts`, and the result
 * depends only on its inputs.
 */
export function buildPrintUrl(
  type: PrintType,
  s: Selections,
  opts: { orderIds: readonly string[]; summary?: boolean },
): string {
  const { orderIds, summary = false } = opts;
  const applicable = APPLICABILITY_MATRIX[type];

  // Route selection: single-order when exactly one id and no summary view;
  // bulk (with or without `summary=1`) otherwise.
  // Exception: plan-utroska-rekapitulacija always uses the bulk route because
  // the single-order route does not have a dedicated rekapitulacija page.
  const useSingleOrder = orderIds.length === 1 && !summary && type !== "plan-utroska-rekapitulacija";

  // Assemble query params in a stable, canonical order: routing params first
  // (`ids`, `section`, `summary`), then matrix controls in the order used by
  // the matrix table (articles, parts, departments, components, sort,
  // aggregate). Order is cosmetic — readPrintParams is order-insensitive —
  // but a stable order makes URLs diff-friendly and easier to test.
  const parts: string[] = [];

  if (!useSingleOrder) {
    // UUIDs are URL-safe so no per-id encoding is needed. `serializeIds`
    // joins them with literal commas, matching the design's URL examples
    // (e.g. `ids=abc,def`) and the route-side `parseIds` contract in
    // `filter-helpers.ts`.
    parts.push(`ids=${serializeIds([...orderIds])}`);
    if (summary) {
      parts.push("summary=1");
    } else {
      parts.push(`section=${type}`);
    }
  }

  if (applicable.has("articles")) {
    const names = normalizeTokens(s.articles);
    if (names.length > 0) {
      parts.push(`articles=${names.map(encodeURIComponent).join(",")}`);
    }
  }

  if (applicable.has("parts")) {
    const names = normalizeTokens(s.parts);
    if (names.length > 0) {
      parts.push(`parts=${names.map(encodeURIComponent).join(",")}`);
    }
  }

  if (applicable.has("departments")) {
    const ids = normalizeTokens(s.departments);
    if (ids.length > 0) {
      parts.push(`departments=${serializeIds(ids)}`);
    }
  }

  if (applicable.has("components")) {
    const names = normalizeTokens(s.components);
    if (names.length > 0) {
      parts.push(`components=${names.map(encodeURIComponent).join(",")}`);
    }
  }

  if (applicable.has("sort")) {
    const keys = normalizeTokens(s.sort as readonly string[]) as SortKey[];
    if (keys.length > 0) {
      parts.push(`sort=${keys.join(",")}`);
    }
  }

  if (applicable.has("aggregate") && s.aggregate) {
    parts.push("aggregate=1");
  }

  if (applicable.has("groupByBed") && s.groupByBed) {
    parts.push("groupByBed=1");
  }

  if (applicable.has("bedType") && s.bedType !== "all") {
    parts.push(`bedType=${encodeURIComponent(s.bedType)}`);
  }

  if (applicable.has("dateRange")) {
    if (s.dateFrom) {
      parts.push(`dateFrom=${encodeURIComponent(s.dateFrom)}`);
    }
    if (s.dateTo) {
      parts.push(`dateTo=${encodeURIComponent(s.dateTo)}`);
    }
  }

  const base = useSingleOrder
    ? `/production/${encodeURIComponent(orderIds[0])}/print/${type}`
    : `/production/print/bulk`;

  const qs = parts.join("&");
  return qs.length > 0 ? `${base}?${qs}` : base;
}

/**
 * The six canonical packaging component names the modal offers for
 * `pakovanje` prints (Req 11.1). Kept local to this module and deliberately
 * distinct from `ALL_BED_COMPONENTS` in `bed-label-helpers.ts`, which lacks
 * the narrow-bed single `"Baza"` value that the component filter needs.
 */
const CANONICAL_COMPONENT_NAMES: ReadonlySet<string> = new Set([
  "Lijeva Baza",
  "Desna Baza",
  "Baza",
  "Nogice",
  "Uzglavlje",
  "Madrac",
]);

/**
 * Normalize a raw `searchParams` value into a single string. Next.js App
 * Router hands params in as `string | string[] | undefined`:
 *   - `undefined`  → `undefined`
 *   - single string → passed through
 *   - `string[]`   → last value (matches Next's own "latest wins" convention
 *                    and keeps the reader robust against duplicated keys).
 * Anything else (shape we don't expect) is treated as absent.
 */
function pickSingleParam(
  raw: string | string[] | undefined
): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    const last = raw[raw.length - 1];
    return typeof last === "string" ? last : undefined;
  }
  return undefined;
}

/**
 * Split a raw comma-separated param into trimmed, de-duplicated tokens.
 * Empty / whitespace-only tokens (including those produced by trailing or
 * consecutive commas) are dropped, so `"a,,b,"` becomes `["a", "b"]`
 * (Req 6.1, "malformed values treated as absent").
 */
function parseTokenList(raw: string | undefined): string[] {
  if (raw === undefined) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of raw.split(",")) {
    const trimmed = piece.trim();
    if (trimmed.length === 0) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * Parse a route's `searchParams` into a typed, matrix-filtered view.
 *
 * Matrix discipline (Req 9.3, Property 5): only params whose control is
 * listed in `APPLICABILITY_MATRIX[type]` are parsed. Any other param
 * present in the URL is silently ignored — existing bookmarks that carry
 * extra query keys still load without side effects.
 *
 * Normalization (Req 6.1):
 *   - Collection params (`articles`, `parts`, `departments`, `components`)
 *     are trimmed, de-duplicated, and stripped of empty / whitespace-only
 *     tokens before being returned as a `ReadonlySet<string>`.
 *   - `components` is further intersected with the six canonical packaging
 *     component names (Req 11.1) so unknown values are dropped.
 *   - `sort` delegates to `parseSortParam` (drops unknown sort keys) and is
 *     then de-duplicated while preserving first-seen order.
 *   - `aggregate` is `true` iff the raw value is exactly `"1"`; every other
 *     shape (missing, `"0"`, malformed) is treated as `false`.
 *
 * Malformed values (Req 9.x, design "Error Handling"): a `string[]` param
 * shape is collapsed to its last element (Next.js "latest wins"); a trailing
 * or doubled comma produces the same set as a clean input.
 *
 * Always returns every slot of `AppliedParams`. Controls outside the matrix
 * row are returned in their empty form (empty set / empty list / `false`),
 * matching `EMPTY_SELECTIONS`.
 */
export function readPrintParams(
  type: PrintType,
  searchParams: Record<string, string | string[] | undefined>,
): AppliedParams {
  const applicable = APPLICABILITY_MATRIX[type];

  let articles: ReadonlySet<string> = EMPTY_SELECTIONS.articles;
  if (applicable.has("articles")) {
    const tokens = parseTokenList(pickSingleParam(searchParams["articles"]));
    if (tokens.length > 0) articles = new Set(tokens);
  }

  let parts: ReadonlySet<string> = EMPTY_SELECTIONS.parts;
  if (applicable.has("parts")) {
    const tokens = parseTokenList(pickSingleParam(searchParams["parts"]));
    if (tokens.length > 0) parts = new Set(tokens);
  }

  let departments: ReadonlySet<string> = EMPTY_SELECTIONS.departments;
  if (applicable.has("departments")) {
    // `parseIds` already splits on "," and drops empty tokens; wrap in a
    // Set to de-duplicate (Req 6.1).
    const ids = parseIds(pickSingleParam(searchParams["departments"]));
    if (ids.length > 0) departments = new Set(ids);
  }

  let components: ReadonlySet<string> = EMPTY_SELECTIONS.components;
  if (applicable.has("components")) {
    const tokens = parseTokenList(pickSingleParam(searchParams["components"]));
    const canonical = tokens.filter((t) => CANONICAL_COMPONENT_NAMES.has(t));
    if (canonical.length > 0) components = new Set(canonical);
  }

  let sort: readonly SortKey[] = EMPTY_SELECTIONS.sort;
  if (applicable.has("sort")) {
    const keys = parseSortParam(pickSingleParam(searchParams["sort"]));
    if (keys.length > 0) {
      // De-duplicate while preserving first-seen order so `sort=abc,abc`
      // parses identically to `sort=abc` (Req 6.1).
      const seen = new Set<SortKey>();
      const deduped: SortKey[] = [];
      for (const k of keys) {
        if (seen.has(k)) continue;
        seen.add(k);
        deduped.push(k);
      }
      sort = deduped;
    }
  }

  let aggregate: boolean = EMPTY_SELECTIONS.aggregate;
  if (applicable.has("aggregate")) {
    aggregate = pickSingleParam(searchParams["aggregate"]) === "1";
  }

  let groupByBed: boolean = EMPTY_SELECTIONS.groupByBed;
  if (applicable.has("groupByBed")) {
    groupByBed = pickSingleParam(searchParams["groupByBed"]) === "1";
  }

  let bedType: "all" | "Drveni" | "Metalni" = EMPTY_SELECTIONS.bedType;
  if (applicable.has("bedType")) {
    const raw = pickSingleParam(searchParams["bedType"]);
    if (raw === "Drveni" || raw === "Metalni") bedType = raw;
  }

  let dateFrom: string = EMPTY_SELECTIONS.dateFrom;
  let dateTo: string = EMPTY_SELECTIONS.dateTo;
  if (applicable.has("dateRange")) {
    const rawFrom = pickSingleParam(searchParams["dateFrom"]);
    if (rawFrom && /^\d{4}-\d{2}-\d{2}$/.test(rawFrom)) dateFrom = rawFrom;
    const rawTo = pickSingleParam(searchParams["dateTo"]);
    if (rawTo && /^\d{4}-\d{2}-\d{2}$/.test(rawTo)) dateTo = rawTo;
  }

  return { articles, parts, departments, components, sort, aggregate, groupByBed, bedType, dateFrom, dateTo };
}

/**
 * Human-readable Bosnian labels for the primary confirmation button in the
 * print options modal, keyed by `PrintType`. The modal's single primary
 * action renders this string (Req 8.4) so the button always reflects the
 * document the user is about to generate.
 */
const PRIMARY_ACTION_LABELS: Readonly<Record<PrintType, string>> = {
  "radni-nalog":        "Štampaj radni nalog",
  "order":              "Štampaj pregled naloga",
  "plan-utroska":       "Štampaj plan utroška",
  "plan-utroska-rekapitulacija": "Štampaj rekapitulaciju",
  "etikete":            "Štampaj sve etikete",
  "pakovanje":          "Štampaj etikete pakovanja",
  "zbirni-radni-nalog": "Štampaj zbirni radni nalog",
  "print-za-odjele":    "Štampaj za odjele",
};

/**
 * Return the human-readable Bosnian label for the print options modal's
 * primary confirmation button for the given Print_Type (Req 8.4).
 *
 * Pure and synchronous; safe to call from both server and client render
 * paths.
 */
export function primaryActionLabel(type: PrintType): string {
  return PRIMARY_ACTION_LABELS[type];
}
