/**
 * Type definitions za async Request APIs u Next.js 16
 * 
 * Next.js 16 uvodi breaking change gde params, searchParams, cookies, headers,
 * i draftMode postaju async APIs koje moraju biti awaited pre korišćenja.
 */

/**
 * Page props sa async params i searchParams
 * 
 * @example
 * ```typescript
 * export default async function Page({ params, searchParams }: PageProps) {
 *   const { id } = await params;
 *   const { q } = await searchParams;
 * }
 * ```
 */
export interface PageProps {
  params: Promise<{ [key: string]: string | string[] }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

/**
 * API route context sa async params
 * 
 * @example
 * ```typescript
 * export async function GET(request: Request, context: RouteContext) {
 *   const { id } = await context.params;
 * }
 * ```
 */
export interface RouteContext {
  params: Promise<{ [key: string]: string | string[] }>;
}

/**
 * Helper funkcija za type-safe pristup params
 * 
 * Omogućava type-safe destructuring params objekta sa custom type definicijom.
 * 
 * @template T - Type definition za params objekat
 * @param params - Promise sa params objektom iz Next.js
 * @returns Promise sa typed params objektom
 * 
 * @example
 * ```typescript
 * const params = await getParams<{ id: string }>(props.params);
 * console.log(params.id); // Type-safe pristup
 * ```
 */
export async function getParams<T extends Record<string, string>>(
  params: Promise<{ [key: string]: string | string[] }>
): Promise<T> {
  return (await params) as T;
}

/**
 * Helper funkcija za type-safe pristup searchParams
 * 
 * Omogućava type-safe destructuring searchParams objekta sa custom type definicijom.
 * 
 * @template T - Type definition za searchParams objekat
 * @param searchParams - Promise sa searchParams objektom iz Next.js
 * @returns Promise sa typed searchParams objektom
 * 
 * @example
 * ```typescript
 * const search = await getSearchParams<{ q?: string; page?: string }>(props.searchParams);
 * console.log(search.q); // Type-safe pristup, može biti undefined
 * ```
 */
export async function getSearchParams<T extends Record<string, string | undefined>>(
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
): Promise<T> {
  return (await searchParams) as T;
}
