export const DEALS_SEARCH_QUERY_PARAM = "q"

export function dealsSearchTargetPath(
  mode: "investing" | "syndicating",
): string {
  return mode === "investing" ? "/dashboard" : "/deals"
}

export function isDealsSearchContextPath(pathname: string): boolean {
  const p = pathname.replace(/\/$/, "") || "/"
  return p === "/deals" || p === "/dashboard"
}

export function readDealsSearchQuery(
  params: URLSearchParams,
): string {
  return params.get(DEALS_SEARCH_QUERY_PARAM)?.trim() ?? ""
}

export function applyDealsSearchToParams(
  params: URLSearchParams,
  query: string,
): URLSearchParams {
  const next = new URLSearchParams(params)
  const trimmed = query.trim()
  if (trimmed) next.set(DEALS_SEARCH_QUERY_PARAM, trimmed)
  else next.delete(DEALS_SEARCH_QUERY_PARAM)
  return next
}
