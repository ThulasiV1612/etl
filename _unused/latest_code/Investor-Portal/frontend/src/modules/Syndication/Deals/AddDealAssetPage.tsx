import {
  ArrowLeft,
  ChevronRight,
  Plus,
  Save,
  X,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react"
import { Link, useLocation, useNavigate, useParams } from "react-router-dom"
import { focusFirstFormErrorAfterUpdate, scrollMultiStepFormToTopAfterUpdate } from "../../../common/utils/scrollToFirstFormError"
import {
  buildDealDetailReturnSearch,
  type DealDetailReturnState,
} from "./utils/offeringDetailsSectionNav"
import { FormHeadingWithInfo } from "../../../common/components/form-heading/FormHeadingWithInfo"
import { toast } from "../../../common/components/Toast"
import { assetImagePathsToUrls } from "../../../common/utils/apiBaseUrl"
import { setAppDocumentTitle } from "../../../common/utils/appDocumentTitle"
import { fetchDealById, patchDealOfferingGallery, postDealOfferingGalleryUploads } from "./api/dealsApi"
import { mapDealDetailApiToCreateDrafts } from "./createDealFormMap"
import { AssetAdditionalInfoSection } from "./components/AssetAdditionalInfoSection"
import { AssetStepForm } from "./components/AssetStepForm"
import {
  ASSET_MAX_IMAGE_COUNT,
  assetTypeFromAttributes,
  createDefaultAssetAttributeRows,
  normalizeAssetAttributeMoneyRows,
  formatAddressFromAssetDraft,
  getDealAssetPersisted,
  primaryDealAssetRowId,
  serializeAdditionalInfo,
  type AssetAttributeRow,
  type DealAssetPersisted,
  type DealAssetRow,
} from "./types/deal-asset.types"
import {
  saveDealAssetToServer,
  syncDealAssetsFromServer,
} from "./utils/dealAssetsServerSync"
import { zipCodeFieldError } from "./utils/dealZipCode"
import { dedupeGalleryUrlsPreserveOrder, collectGalleryPathsFromDealAssetsMap } from "./utils/offeringGalleryUrls"
import { emptyAssetStepDraft, type AssetStepDraft } from "./types/deals.types"
import "../contacts/contacts.css"
import "../usermanagement/user_management.css"
import "./deal-investor-class.css"
import "./deals-create.css"
import "./deals-list.css"
import "./components/asset-additional-info.css"

export function AddDealAssetPage() {
  const titleId = useId()
  const { dealId, assetId: assetIdParam } = useParams<{
    dealId: string
    assetId?: string
  }>()
  const navigate = useNavigate()
  const location = useLocation()
  const returnState = location.state as DealDetailReturnState | null
  const isEdit = Boolean(assetIdParam?.trim())
  const assetId = assetIdParam?.trim() ?? ""

  const [step, setStep] = useState<1 | 2>(1)
  const [assetDraft, setAssetDraft] = useState<AssetStepDraft>(emptyAssetStepDraft)
  const [assetErrors, setAssetErrors] = useState<
    Partial<Record<keyof AssetStepDraft, string>>
  >({})
  const [assetImageFiles, setAssetImageFiles] = useState<File[]>([])
  /** Data URLs or `/uploads/…` URLs — shown when editing */
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([])
  const [attrRows, setAttrRows] = useState<AssetAttributeRow[]>(() =>
    createDefaultAssetAttributeRows(),
  )
  const [hydrated, setHydrated] = useState(!isEdit)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const stepScrollBootRef = useRef(true)

  const dealDetailPath =
    dealId != null && dealId !== ""
      ? `/deals/${encodeURIComponent(dealId)}`
      : "/deals"

  const dealDetailReturnPath = useMemo(() => {
    if (!returnState?.returnTab && !returnState?.returnSection)
      return dealDetailPath
    return `${dealDetailPath}${buildDealDetailReturnSearch({
      tab: returnState.returnTab,
      offeringSection: returnState.returnSection,
    })}`
  }, [dealDetailPath, returnState?.returnSection, returnState?.returnTab])

  const goBack = useCallback(() => {
    navigate(dealDetailReturnPath)
  }, [dealDetailReturnPath, navigate])

  useEffect(() => {
    setAppDocumentTitle(isEdit ? "Edit Asset" : "Add Asset")
  }, [isEdit])

  useEffect(() => {
    if (!dealId || !isEdit) {
      setHydrated(true)
      setLoadError(null)
      return
    }

    let cancelled = false
    setHydrated(false)
    setLoadError(null)

    const primaryId = primaryDealAssetRowId(dealId)

    void (async () => {
      try {
        await syncDealAssetsFromServer(dealId)
        if (cancelled) return

        const persisted = getDealAssetPersisted(dealId, assetId)
        if (persisted) {
          setAssetDraft(persisted.draft)
          setAttrRows(normalizeAssetAttributeMoneyRows(persisted.attrRows))
          const saved = persisted.imagePreviewDataUrls
          const fromSaved = Array.isArray(saved) ? saved : []
          if (
            assetId === primaryId &&
            !Array.isArray(persisted.imagePreviewDataUrls)
          ) {
            try {
              const detail = await fetchDealById(dealId)
              if (cancelled) return
              const fromApi = assetImagePathsToUrls(detail.assetImagePath)
              setExistingImageUrls(
                dedupeGalleryUrlsPreserveOrder(
                  fromSaved.length > 0 ? [...fromSaved] : fromApi,
                ),
              )
            } catch {
              if (!cancelled)
                setExistingImageUrls(dedupeGalleryUrlsPreserveOrder(fromSaved))
            }
          } else {
            setExistingImageUrls(dedupeGalleryUrlsPreserveOrder(fromSaved))
          }
          return
        }

        if (assetId === primaryId) {
          const detail = await fetchDealById(dealId)
          if (cancelled) return
          const { asset } = mapDealDetailApiToCreateDrafts(detail)
          setAssetDraft(asset)
          setAttrRows(createDefaultAssetAttributeRows())
          setExistingImageUrls(
            dedupeGalleryUrlsPreserveOrder(
              assetImagePathsToUrls(detail.assetImagePath),
            ),
          )
          return
        }

        if (!cancelled)
          setLoadError(
            "This asset is no longer available to edit. Return to the deal and refresh.",
          )
      } catch {
        if (!cancelled)
          setLoadError("Could not load this asset. Try again from the deal page.")
      } finally {
        if (!cancelled) setHydrated(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [dealId, isEdit, assetId])

  useEffect(() => {
    if (isEdit) return
    setAssetDraft(emptyAssetStepDraft())
    setAttrRows(createDefaultAssetAttributeRows())
    setAssetImageFiles([])
    setExistingImageUrls([])
    setStep(1)
    setAssetErrors({})
  }, [dealId, isEdit])

  useEffect(() => {
    if (stepScrollBootRef.current) {
      stepScrollBootRef.current = false
      return
    }
    scrollMultiStepFormToTopAfterUpdate({ container: formRef.current })
  }, [step])

  const patchAsset = useCallback((patch: Partial<AssetStepDraft>) => {
    setAssetDraft((d) => ({ ...d, ...patch }))
    setAssetErrors((e) => {
      const next = { ...e }
      for (const k of Object.keys(patch) as (keyof AssetStepDraft)[]) {
        delete next[k]
      }
      return next
    })
  }, [])

  const addCustomAttribute = useCallback(() => {
    setAttrRows((rows) => [
      ...rows,
      {
        id: `attr-custom-${Date.now()}`,
        label: "",
        kind: "text",
        value: "",
        preset: false,
      },
    ])
  }, [])

  function validateDetails(): boolean {
    const nextErr: Partial<Record<keyof AssetStepDraft, string>> = {}
    if (!assetDraft.propertyName.trim()) {
      nextErr.propertyName = "Property name is required."
    }
    const zipErr = zipCodeFieldError(assetDraft.zipCode)
    if (zipErr) nextErr.zipCode = zipErr
    setAssetErrors(nextErr)
    const fieldOk = Object.keys(nextErr).length === 0
    const imageCount = existingImageUrls.length + assetImageFiles.length
    if (imageCount > ASSET_MAX_IMAGE_COUNT) {
      toast.error(
        `Each asset can have up to ${ASSET_MAX_IMAGE_COUNT} images. Remove ${imageCount - ASSET_MAX_IMAGE_COUNT} to continue.`,
      )
    }
    const ok = fieldOk && imageCount <= ASSET_MAX_IMAGE_COUNT
    if (!ok) {
      focusFirstFormErrorAfterUpdate({ container: formRef.current })
    }
    return ok
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!dealId || saving) return
    if (step === 1) {
      if (validateDetails()) setStep(2)
      return
    }

    if (!validateDetails()) {
      setStep(1)
      return
    }

    setSaving(true)
    const filesToUpload = [...assetImageFiles]
    setAssetImageFiles([])
    try {
      const resolvedId = isEdit ? assetId : `asset-${Date.now()}`
      const prev = isEdit ? getDealAssetPersisted(dealId, resolvedId) : undefined

      let imagePreviewDataUrls = dedupeGalleryUrlsPreserveOrder([
        ...existingImageUrls,
      ])

      if (filesToUpload.length > 0) {
        const up = await postDealOfferingGalleryUploads(dealId, filesToUpload)
        if (!up.ok) {
          setAssetImageFiles(filesToUpload)
          toast.error(up.message)
          return
        }
        const fromPaths = assetImagePathsToUrls(up.newPaths.join(";"))
        imagePreviewDataUrls = dedupeGalleryUrlsPreserveOrder([
          ...imagePreviewDataUrls,
          ...fromPaths,
        ])
      }

      const imageCount = imagePreviewDataUrls.length

      const row: DealAssetRow = {
        id: resolvedId,
        name: assetDraft.propertyName.trim(),
        address: formatAddressFromAssetDraft(assetDraft),
        assetType: assetTypeFromAttributes(attrRows),
        imageCount,
        archived: prev?.row.archived ?? false,
        additionalInfo: serializeAdditionalInfo(attrRows),
      }

      const entry: DealAssetPersisted = {
        id: resolvedId,
        row,
        draft: assetDraft,
        attrRows,
        imagePreviewDataUrls,
      }
      const saved = await saveDealAssetToServer(dealId, entry)
      if (!saved.ok) {
        setAssetImageFiles(filesToUpload)
        toast.error(
          saved.message ||
            "Could not save asset to the server. Check your connection and try again.",
        )
        return
      }

      const galleryPaths = collectGalleryPathsFromDealAssetsMap(dealId)
      const gallerySync = await patchDealOfferingGallery(dealId, galleryPaths)
      if (!gallerySync.ok) {
        toast.error(
          gallerySync.message ||
            "Asset saved but gallery could not be synced. Try saving again.",
        )
        return
      }

      setAssetImageFiles([])
      setExistingImageUrls(imagePreviewDataUrls)
      toast.success(isEdit ? "Asset updated" : "Asset added")
      navigate(dealDetailReturnPath)
    } finally {
      setSaving(false)
    }
  }

  if (!dealId) {
    return (
      <div className="deals_list_page deals_detail_page">
        <p className="deals_list_not_found">Missing deal.</p>
        <Link to="/deals" className="deals_list_inline_back">
          Back to deals
        </Link>
      </div>
    )
  }

  if (isEdit && !hydrated) {
    return (
      <div className="deals_list_page deals_detail_page deals_add_investor_class_page deals_add_deal_asset_page deals_page_loader_center">
        <p className="deals_list_not_found" role="status">
          Loading asset…
        </p>
        <Link to={dealDetailReturnPath} className="deals_list_inline_back">
          Back to deal
        </Link>
      </div>
    )
  }

  if (isEdit && loadError) {
    return (
      <div className="deals_list_page deals_detail_page deals_add_investor_class_page deals_add_deal_asset_page">
        <p className="deals_list_not_found">{loadError}</p>
        <Link to={dealDetailReturnPath} className="deals_list_inline_back">
          Back to deal
        </Link>
      </div>
    )
  }

  return (
    <div className="deals_list_page deals_detail_page deals_add_investor_class_page deals_add_deal_asset_page">
      <header className="deals_list_head deals_add_investor_class_page_head">
        <div className="deals_add_deal_asset_head_main">
          <div className="deals_list_title_row deals_add_deal_asset_title_row">
            <button
              type="button"
              className="deals_list_back_circle"
              onClick={goBack}
              aria-label="Back to deal"
            >
              <ArrowLeft size={20} strokeWidth={2} aria-hidden />
            </button>
            <div className="deals_add_deal_asset_title_stack">
              <h1 id={titleId} className="deals_list_title">
                {isEdit ? "Edit Asset" : "Add Asset"}
              </h1>
            </div>
          </div>
          <div
            className="add_contact_stepper deals_add_deal_asset_stepper"
            role="group"
            aria-label="Progress"
          >
            <div
              className={
                step === 1
                  ? "add_contact_step_node add_contact_step_node_active"
                  : "add_contact_step_node add_contact_step_node_done"
              }
            >
              <span
                className="add_contact_step_dot"
                aria-current={step === 1 ? "step" : undefined}
              >
                1
              </span>
              <span className="add_contact_step_label">Assets</span>
            </div>
            <span
              className={
                step === 2
                  ? "add_contact_step_line add_contact_step_line_active"
                  : "add_contact_step_line"
              }
              aria-hidden
            />
            <div
              className={
                step === 2
                  ? "add_contact_step_node add_contact_step_node_active"
                  : "add_contact_step_node"
              }
            >
              <span className="add_contact_step_dot">2</span>
              <span className="add_contact_step_label">
                Additional Information
              </span>
            </div>
          </div>
        </div>
      </header>

      <section className="deals_add_deal_asset_panel">
        <form
          ref={formRef}
          className="deals_add_deal_asset_form"
          onSubmit={handleSubmit}
          noValidate
        >
          <div className="deals_add_deal_asset_form_scroll">
            {step === 1 ? (
              <AssetStepForm
                draft={assetDraft}
                errors={assetErrors}
                imageFiles={assetImageFiles}
                onChange={patchAsset}
                onImageFilesChange={setAssetImageFiles}
                existingImageUrls={existingImageUrls}
                onRemoveExistingImage={(i) =>
                  setExistingImageUrls((prev) =>
                    prev.filter((_, j) => j !== i),
                  )
                }
              />
            ) : (
              <div
                className="deals_add_deal_asset_additional"
                aria-labelledby="deal-add-asset-additional-heading"
              >
                <div className="deals_add_deal_asset_additional_head">
                  <div>
                    <FormHeadingWithInfo
                      as="h2"
                      id="deal-add-asset-additional-heading"
                      className="deals_add_deal_asset_additional_subtitle"
                      title="Additional information"
                      info={
                        <p>
                          Drag the dots to reorder. Attributes without a value
                          will be hidden from LPs.
                        </p>
                      }
                    />
                  </div>
                  <button
                    type="button"
                    className="um_btn_secondary deals_add_deal_asset_add_attr_btn"
                    onClick={addCustomAttribute}
                  >
                    <Plus size={18} strokeWidth={2} aria-hidden />
                    Add attribute
                  </button>
                </div>

                <AssetAdditionalInfoSection
                  rows={attrRows}
                  onChange={setAttrRows}
                />
              </div>
            )}
          </div>

          <div className="um_modal_actions add_contact_modal_actions deal_inv_ic_add_panel_actions deals_add_deal_asset_footer_actions">
            <button type="button" className="um_btn_secondary" onClick={goBack}>
              <X size={16} strokeWidth={2} aria-hidden />
              Close
            </button>
            <div className="add_contact_modal_actions_trailing">
              {step === 2 ? (
                <button
                  type="button"
                  className="um_btn_secondary"
                  onClick={() => setStep(1)}
                >
                  <ArrowLeft size={16} strokeWidth={2} aria-hidden />
                  Back
                </button>
              ) : null}
              {step === 1 ? (
                <button type="submit" className="um_btn_primary" disabled={saving}>
                  Next
                  <ChevronRight size={18} strokeWidth={2} aria-hidden />
                </button>
              ) : (
                <button type="submit" className="um_btn_primary" disabled={saving}>
                  <Save size={16} strokeWidth={2} aria-hidden />
                  {saving
                    ? "Saving…"
                    : isEdit
                      ? "Save changes"
                      : "Save asset"}
                </button>
              )}
            </div>
          </div>
        </form>
      </section>
    </div>
  )
}
