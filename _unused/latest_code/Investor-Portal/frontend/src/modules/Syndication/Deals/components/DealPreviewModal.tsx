import { ExternalLink, Loader2, Pencil, X } from "lucide-react"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "react-router-dom"
import "../../usermanagement/user_management.css"
import { getSessionUserEmail } from "../../../../common/auth/sessionUserEmail"
import {
  fetchDealById,
  fetchDealInvestors,
  fetchDealMembers,
  type DealDetailApi,
} from "../api/dealsApi"
import { DealDetailsReadonlyPreviewFields } from "./DealDetailsReadonlyPreview"
import { DealInvestorRoleBadge } from "../tabs/investors/DealInvestorRoleBadge"
import { resolveViewerDealInvestorRoleRaw } from "../utils/dealDetailTabVisibility"
import "../deals-list.css"

export type DealPreviewListContext = "syndicating" | "investing"

interface DealPreviewModalProps {
  dealId: string | null
  /** Investing deals list: show viewer roster role and hide syndication-only actions. */
  listContext?: DealPreviewListContext
  onClose: () => void
}

export function DealPreviewModal({
  dealId,
  listContext = "syndicating",
  onClose,
}: DealPreviewModalProps) {
  const navigate = useNavigate()
  const [detail, setDetail] = useState<DealDetailApi | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewerDealInvestorRoleRaw, setViewerDealInvestorRoleRaw] =
    useState<string | null>(null)

  useEffect(() => {
    if (!dealId) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [dealId, onClose])

  useEffect(() => {
    if (!dealId) {
      setDetail(null)
      setError(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    setDetail(null)
    void (async () => {
      try {
        const d = await fetchDealById(dealId)
        if (!cancelled) {
          setDetail(d)
          setLoading(false)
        }
      } catch {
        if (!cancelled) {
          setError("Unable to load deal details.")
          setDetail(null)
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [dealId])

  useEffect(() => {
    if (!dealId) {
      setViewerDealInvestorRoleRaw(null)
      return
    }
    const email = getSessionUserEmail()
    if (!email) {
      setViewerDealInvestorRoleRaw(null)
      return
    }
    let cancelled = false
    setViewerDealInvestorRoleRaw(null)
    void (async () => {
      try {
        const [{ investors }, membersResult] = await Promise.all([
          fetchDealInvestors(dealId),
          fetchDealMembers(dealId),
        ])
        if (cancelled) return
        setViewerDealInvestorRoleRaw(
          resolveViewerDealInvestorRoleRaw(membersResult.members, email) ??
            resolveViewerDealInvestorRoleRaw(investors, email),
        )
      } catch {
        if (!cancelled) setViewerDealInvestorRoleRaw(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [dealId])

  function handleEdit() {
    if (!dealId) return
    onClose()
    navigate(`/deals/create?edit=${encodeURIComponent(dealId)}`)
  }

  function handleOpenDeal() {
    if (!dealId) return
    onClose()
    navigate(`/deals/${encodeURIComponent(dealId)}`)
  }

  if (dealId == null) return null

  return createPortal(
    <div
      className="um_modal_overlay deals_deal_view_modal_overlay"
      role="presentation"
    >
      <div
        className="um_modal um_modal_view deals_deal_view_modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="deals-deal-view-title"
        aria-busy={loading}
      >
        <div className="um_modal_head">
          <h2 id="deals-deal-view-title" className="um_modal_title">
            Deal details
          </h2>
          <button
            type="button"
            className="um_modal_close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={20} strokeWidth={2} aria-hidden />
          </button>
        </div>

        <div className="deals_deal_view_modal_body">
          {viewerDealInvestorRoleRaw ? (
            <div
              className="deals_deal_view_sponsor_role_banner"
              role="status"
              aria-label="Your role on this deal"
            >
              <span className="deals_deal_view_sponsor_role_label">
                Your role on this deal
              </span>
              <DealInvestorRoleBadge
                investorRole={viewerDealInvestorRoleRaw}
              />
            </div>
          ) : null}
          {loading ? (
            <div className="deals_deal_view_state" aria-live="polite">
              <Loader2
                className="deals_deal_view_spinner"
                size={28}
                strokeWidth={2}
                aria-hidden
              />
              <p className="deals_deal_view_state_text">Loading deal…</p>
            </div>
          ) : error ? (
            <p className="deals_deal_view_error" role="alert">
              {error}
            </p>
          ) : detail?.listRow ? (
            <DealDetailsReadonlyPreviewFields detail={detail} />
          ) : (
            <p className="deals_deal_view_hint">No data.</p>
          )}
        </div>

        <div className="um_modal_actions um_modal_actions_view deals_deal_view_modal_actions">
          <button
            type="button"
            className="um_btn_secondary"
            onClick={onClose}
          >
            <X size={16} strokeWidth={2} aria-hidden />
            Close
          </button>
          {listContext === "investing" ||
          detail?.viewerCanEditDeal === false ? (
            <button
              type="button"
              className="um_btn_primary"
              onClick={handleOpenDeal}
              disabled={!detail || Boolean(loading)}
            >
              <ExternalLink size={16} strokeWidth={2} aria-hidden />
              Open deal
            </button>
          ) : (
            <button
              type="button"
              className="um_btn_primary"
              onClick={handleEdit}
              disabled={!detail || Boolean(loading)}
            >
              <Pencil size={16} strokeWidth={2} aria-hidden />
              Edit
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
