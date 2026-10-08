import { ArrowLeft, Loader2 } from "lucide-react"
import { lazy, Suspense, useCallback, useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { toast } from "@/common/components/Toast"
import {
  type ProfileBookSnapshot,
  fetchMyProfileBook,
  putInvestorProfile,
} from "./investingProfileBookApi"
import type { SavedAddress } from "./address.types"
import type { InvestorProfileListRow, UpdateInvestorProfilePayload } from "./investor-profiles.types"
import "@/modules/Syndication/usermanagement/user_management.css"
import "@/modules/Syndication/Deals/deals-list.css"
import "@/modules/Syndication/Deals/deals-create.css"
import "./add-investor-profile-modal.css"
import "./investing-profiles.css"

const AddInvestorProfileModal = lazy(() => import("./AddInvestorProfileModal"))

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(s: string): boolean {
  return typeof s === "string" && UUID_RE.test(s.trim())
}

/**
 * Full-page edit: same wizard as Add (4 content steps for Joint/Entity, 5 for Individual with optional
 * Beneficiary), then a final step for audit “reason for change”, then `PUT` with name, type, reason, and wizard state.
 * Route: `/investing/profiles/:profileId/edit`
 */
export function EditInvestorProfilePage() {
  const { profileId } = useParams<{ profileId: string }>()
  const navigate = useNavigate()
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([])
  const [savedBeneficiaries, setSavedBeneficiaries] = useState<
    ProfileBookSnapshot["beneficiaries"]
  >([])
  const [profile, setProfile] = useState<InvestorProfileListRow | null>(null)
  const [existingProfiles, setExistingProfiles] = useState<InvestorProfileListRow[]>(
    [],
  )
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profileId || !isUuid(profileId)) {
      setLoadError("Invalid profile link.")
      setLoading(false)
      setProfile(null)
      return
    }
    let cancelled = false
    setLoadError(null)
    setLoading(true)
    void (async () => {
      try {
        const book = await fetchMyProfileBook()
        if (cancelled) return
        setSavedAddresses(book.addresses)
        setSavedBeneficiaries(book.beneficiaries)
        setExistingProfiles(book.profiles)
        const row = book.profiles.find((p) => p.id === profileId) ?? null
        if (!row) {
          setLoadError("This profile was not found or is no longer available.")
          setProfile(null)
        } else {
          setProfile(row)
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(
            e instanceof Error
              ? e.message
              : "Could not load your profile data. Check that you are signed in.",
          )
          setProfile(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [profileId])

  const goBack = useCallback(() => {
    navigate("/investing/profiles")
  }, [navigate])

  const onProfileUpdated = useCallback(
    async (id: string, p: UpdateInvestorProfilePayload) => {
      await putInvestorProfile(id, p)
      toast.success("Profile updated", "Your changes were saved.")
      navigate("/investing/profiles")
    },
    [navigate],
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

  if (loadError || !profileId || !isUuid(profileId) || !profile) {
    return (
      <div className="deals_list_page deals_detail_page investing_profiles_page">
        <div className="um_panel" style={{ margin: "1rem" }} role="alert">
          {loadError ?? "Profile not found."}
        </div>
        <div style={{ margin: "0 1rem 1rem" }}>
          <button type="button" className="um_btn_secondary" onClick={goBack}>
            <ArrowLeft size={16} strokeWidth={2} aria-hidden />
            Back to profiles
          </button>
        </div>
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
        key={profile.id}
        open
        mode="edit"
        variant="page"
        editTarget={profile}
        onClose={goBack}
        savedAddresses={savedAddresses}
        savedBeneficiaries={savedBeneficiaries}
        existingProfiles={existingProfiles}
        onAddressAdded={(row) => setSavedAddresses((prev) => [row, ...prev])}
        onBeneficiaryAdded={(row) => setSavedBeneficiaries((prev) => [row, ...prev])}
        onProfileUpdated={onProfileUpdated}
      />
    </Suspense>
  )
}
