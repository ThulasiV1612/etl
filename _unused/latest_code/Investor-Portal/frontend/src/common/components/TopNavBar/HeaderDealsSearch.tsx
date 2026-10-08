import { Search, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { useLocation, useNavigate, useSearchParams } from "react-router-dom"
import { usePortalMode } from "@/modules/Investing/context/PortalModeContext"
import {
  applyDealsSearchToParams,
  dealsSearchTargetPath,
  isDealsSearchContextPath,
  readDealsSearchQuery,
} from "@/common/deals/dealsSearchQuery"

export function HeaderDealsSearch() {
  const { mode } = usePortalMode()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const inputRef = useRef<HTMLInputElement>(null)

  const onDealsContext = isDealsSearchContextPath(location.pathname)
  const urlQuery = onDealsContext ? readDealsSearchQuery(searchParams) : ""

  const [draft, setDraft] = useState(urlQuery)

  useEffect(() => {
    if (onDealsContext) setDraft(urlQuery)
  }, [onDealsContext, urlQuery])

  const applySearch = useCallback(
    (raw: string) => {
      const trimmed = raw.trim()
      const target = dealsSearchTargetPath(mode)

      if (isDealsSearchContextPath(location.pathname)) {
        setSearchParams(applyDealsSearchToParams(searchParams, trimmed), {
          replace: true,
        })
        return
      }

      if (!trimmed) {
        navigate(target)
        return
      }

      const params = new URLSearchParams()
      applyDealsSearchToParams(params, trimmed)
      navigate({ pathname: target, search: params.toString() })
    },
    [location.pathname, mode, navigate, searchParams, setSearchParams],
  )

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    applySearch(draft)
  }

  function handleClear() {
    setDraft("")
    if (onDealsContext) applySearch("")
    else inputRef.current?.focus()
  }

  return (
    <form
      className="top_navbar_deals_search"
      role="search"
      onSubmit={handleSubmit}
    >
      <div className="top_navbar_deals_search_field">
        <Search
          className="top_navbar_deals_search_icon"
          size={20}
          strokeWidth={2}
          aria-hidden
        />
        <input
          ref={inputRef}
          type="search"
          className="top_navbar_deals_search_input"
          placeholder="Search deals..."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Search deals"
        />
        {draft ? (
          <button
            type="button"
            className="top_navbar_deals_search_clear"
            aria-label="Clear search"
            onClick={handleClear}
          >
            <X size={15} strokeWidth={2} aria-hidden />
          </button>
        ) : null}
      </div>
    </form>
  )
}
