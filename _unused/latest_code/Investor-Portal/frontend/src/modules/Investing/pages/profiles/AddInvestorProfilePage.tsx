import { Loader2 } from "lucide-react"
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate, useSearchParams } from "react-router-dom"
import { toast } from "@/common/components/Toast"
import { clearAddProfileDraft } from "./addProfileFormDraftStorage"
import {
  type ProfileBookSnapshot,
  fetchMyProfileBook,
  postInvestorProfile,
  putInvestorProfile,
} from "./investingProfileBookApi"
import type {
  InvestorProfileListRow,
  NewInvestorProfilePayload,
} from "./investor-profiles.types"
import type { SavedAddress } from "./address.types"
import "@/modules/Syndication/usermanagement/user_management.css"
import "@/modules/Syndication/Deals/deals-list.css"
import "@/modules/Syndication/Deals/deals-create.css"
import "./add-investor-profile-modal.css"

const AddInvestorProfileModal = lazy(() => import("./AddInvestorProfileModal"))

/**
 * Full-page add profile (same shell as Create deal) — route `/investing/profiles/add`.
 * Layout, header, stepper, and section are rendered by `AddInvestorProfileModal` (page variant).
 */
export function AddInvestorProfilePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const resumeDraft =
    searchParams.get("resume") === "1" ||
    searchParams.get("resume") === "true"
  const draftProfileId = searchParams.get("profileId")?.trim() || ""
  const returnTo = (
    location.state as { returnTo?: string } | null
  )?.returnTo?.trim()
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([])
  const [savedBeneficiaries, setSavedBeneficiaries] = useState<
    ProfileBookSnapshot["beneficiaries"]
  >([])
  const [existingProfiles, setExistingProfiles] = useState<InvestorProfileListRow[]>(
    [],
  )
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const book = await fetchMyProfileBook()
        if (!cancelled) {
          setSavedAddresses(book.addresses)
          setSavedBeneficiaries(book.beneficiaries)
          setExistingProfiles(book.profiles)
        }
      } catch {
        if (!cancelled) {
          setSavedAddresses([])
          setSavedBeneficiaries([])
          setExistingProfiles([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const resumeFromProfile = useMemo(() => {
    if (!draftProfileId) return null
    const row = existingProfiles.find((p) => p.id === draftProfileId) ?? null
    return row?.isDraft ? row : null
  }, [draftProfileId, existingProfiles])

  const goBack = useCallback(() => {
    navigate(returnTo || "/investing/profiles")
  }, [navigate, returnTo])

  const onProfileCreated = useCallback(
    async (p: NewInvestorProfilePayload, opts?: { existingId?: string }) => {
      const existingId = opts?.existingId?.trim()
      if (existingId) {
        await putInvestorProfile(existingId, { ...p, isDraft: false })
      } else {
        await postInvestorProfile(p)
      }
      clearAddProfileDraft()
      toast.success("Profile added", "Your new profile was saved.")
      navigate(returnTo || "/investing/profiles")
    },
    [navigate, returnTo],
  )

  if (loading) {
    return (
      <div className="deals_list_page deals_detail_page deals_add_investor_class_page deals_add_deal_asset_page deals_create_flow">
        <section
          className="deals_create_loading_panel"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <Loader2
            className="deals_create_loading_icon"
            size={28}
            strokeWidth={2}
            aria-hidden
          />
          <p className="deals_create_loading_text">Loading…</p>
        </section>
      </div>
    )
  }

  return (
    <Suspense
      fallback={
        <div className="deals_list_page deals_detail_page deals_add_investor_class_page deals_add_deal_asset_page deals_create_flow">
          <section
            className="deals_create_loading_panel"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <Loader2
              className="deals_create_loading_icon"
              size={28}
              strokeWidth={2}
              aria-hidden
            />
            <p className="deals_create_loading_text">Loading…</p>
          </section>
        </div>
      }
    >
      <AddInvestorProfileModal
        open
        variant="page"
        resumeDraft={resumeDraft}
        resumeFromProfile={resumeFromProfile}
        onClose={goBack}
        savedAddresses={savedAddresses}
        savedBeneficiaries={savedBeneficiaries}
        existingProfiles={existingProfiles}
        onAddressAdded={(row) => setSavedAddresses((prev) => [row, ...prev])}
        onBeneficiaryAdded={(row) => setSavedBeneficiaries((prev) => [row, ...prev])}
        onProfileCreated={onProfileCreated}
      />
    </Suspense>
  )
}
