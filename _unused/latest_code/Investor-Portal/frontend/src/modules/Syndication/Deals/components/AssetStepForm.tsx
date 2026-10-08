import {
  useEffect,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from "react"
import {
  FormTooltip,
  MandatoryFieldMark,
} from "../../../../common/components/form-tooltip/FormTooltip"
import { useUsCountriesNowLocations } from "../hooks/useUsCountriesNowLocations"
import {
  getUsCitiesForStateCode,
  getUsStateDisplayName,
  getUsStateDropdownOptions,
  isUnitedStatesCountry,
  resolveUsStateCodeForDraft,
} from "../constants/usLocations"
import { ASSET_MAX_IMAGE_COUNT } from "../types/deal-asset.types"
import {
  COUNTRY_OPTIONS,
  type AssetStepDraft,
} from "../types/deals.types"
import { normalizeZipCodeDigits } from "../utils/dealZipCode"
import { DealsCreateDropdownSelect } from "./DealsCreateDropdownSelect"
import { AssetImageUploadSection } from "./AssetImageUploadSection"
import "./asset-step-form.css"

interface AssetStepFormProps {
  draft: AssetStepDraft
  errors: Partial<Record<keyof AssetStepDraft, string>>
  imageFiles: File[]
  onChange: (patch: Partial<AssetStepDraft>) => void
  onImageFilesChange: Dispatch<SetStateAction<File[]>>
  /** Shown in edit: API URLs or saved data URLs for this asset. */
  existingImageUrls?: string[]
  onRemoveExistingImage?: (index: number) => void
  /** When false, omit the section heading (e.g. modal already has a title). */
  showSectionTitle?: boolean
  /**
   * US only: `countriesNow` loads states/cities from CountriesNow.space (with static fallback).
   * `static` uses bundled `us-locations.json` only.
   */
  usLocationSource?: "static" | "countriesNow"
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="deals_create_field_error">{message}</p>
}

/** Keep saved location values visible/selectable even when not in the API list yet. */
function withSavedLocationOption(
  options: { value: string; label: string }[],
  savedRaw: string,
  labelForValue?: (value: string) => string,
): { value: string; label: string }[] {
  const saved = savedRaw.trim()
  if (!saved) return options
  if (options.some((o) => o.value === saved)) return options
  return [
    { value: saved, label: labelForValue?.(saved) ?? saved },
    ...options,
  ]
}

export function AssetStepForm({
  draft,
  errors,
  imageFiles,
  onChange,
  onImageFilesChange,
  existingImageUrls = [],
  onRemoveExistingImage,
  showSectionTitle = true,
  usLocationSource = "countriesNow",
}: AssetStepFormProps) {
  const isUs = isUnitedStatesCountry(draft.country)
  const usStateCode = useMemo(
    () => (isUs ? resolveUsStateCodeForDraft(draft.state) : ""),
    [isUs, draft.state],
  )

  /** Select value: USPS code when known, otherwise raw saved state (custom / legacy). */
  const usStateSelectValue = useMemo(() => {
    if (!isUs) return ""
    if (usStateCode) return usStateCode
    return draft.state.trim()
  }, [isUs, usStateCode, draft.state])

  const countriesNow = useUsCountriesNowLocations({
    enabled: isUs && usLocationSource === "countriesNow",
    selectedStateCode: usStateCode,
    selectedCity: draft.city,
  })

  const usStateOptions = useMemo(() => {
    if (!isUs) return []
    if (usLocationSource === "static") return getUsStateDropdownOptions()
    if (countriesNow.stateOptions.length > 0) return countriesNow.stateOptions
    return getUsStateDropdownOptions()
  }, [isUs, usLocationSource, countriesNow.stateOptions])

  const usStateOptionsForSelect = useMemo(() => {
    const merged = withSavedLocationOption(
      usStateOptions,
      usStateSelectValue,
      (value) => {
        const code = resolveUsStateCodeForDraft(value)
        return code ? getUsStateDisplayName(code) : value
      },
    )
    return merged
  }, [usStateOptions, usStateSelectValue])

  const usCityOptions = useMemo(() => {
    if (!isUs || !usStateCode) return []
    if (usLocationSource === "static") {
      const list = getUsCitiesForStateCode(usStateCode)
      const c = draft.city.trim()
      if (c && !list.includes(c))
        return [...list, c].sort((a, b) => a.localeCompare(b))
      return list
    }
    return countriesNow.cityNames
  }, [
    isUs,
    usStateCode,
    usLocationSource,
    countriesNow.cityNames,
    draft.city,
  ])

  const usCityOptionsForSelect = useMemo(
    () =>
      withSavedLocationOption(
        usCityOptions.map((name) => ({ value: name, label: name })),
        draft.city,
      ),
    [usCityOptions, draft.city],
  )

  const usStatesLoading =
    isUs &&
    usLocationSource === "countriesNow" &&
    countriesNow.statesLoading &&
    countriesNow.stateOptions.length === 0
  const usCitiesLoading =
    isUs &&
    usLocationSource === "countriesNow" &&
    usStateCode &&
    countriesNow.citiesLoading

  useEffect(() => {
    if (!isUs || !draft.state?.trim()) return
    const code = resolveUsStateCodeForDraft(draft.state)
    if (code && code !== draft.state) onChange({ state: code })
  }, [isUs, draft.state, onChange])

  return (
    <section
      className="deals_create_card deals_create_assets"
      aria-labelledby={
        showSectionTitle ? "create-step-assets" : undefined
      }
      aria-label={showSectionTitle ? undefined : "Property and asset details"}
    >
      {showSectionTitle ? (
        <h2
          id="create-step-assets"
          className="deals_create_section_title deals_create_step_card_title"
        >
          Assets
        </h2>
      ) : null}
      <div className="deals_create_fields asset_step_fields">
        <label className="deals_create_label asset_step_label_full">
          <span className="form_label_toolbar">
            <span className="form_label_inline_row">
              <span>Name of property</span>
              <MandatoryFieldMark />
            </span>
            <FormTooltip
              label="About property name"
              content={
                <p>
                  Enter the primary property or asset name for this deal. It
                  appears on documents and summaries.
                </p>
              }
            />
          </span>
          <input
            className="deals_create_input"
            value={draft.propertyName}
            onChange={(e) => onChange({ propertyName: e.target.value })}
            aria-invalid={Boolean(errors.propertyName)}
          />
          <FieldError message={errors.propertyName} />
        </label>

        <label className="deals_create_label">
          <span className="deals_create_label_text">Country</span>
          <DealsCreateDropdownSelect
            options={COUNTRY_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
            }))}
            value={draft.country}
            onChange={(next) => {
              const wasUs = isUnitedStatesCountry(draft.country)
              const nowUs = isUnitedStatesCountry(next)
              if (!wasUs && nowUs)
                onChange({
                  country: next,
                  state: resolveUsStateCodeForDraft(draft.state) || "",
                  city: "",
                })
              else onChange({ country: next })
            }}
            placeholder="Select country"
            searchable
            searchPlaceholder="Search countries…"
            searchAriaLabel="Filter country list"
            searchShowOptionCountHint
            triggerClassName="asset_step_location_bordered"
          />
        </label>

        <label className="deals_create_label">
          <span className="deals_create_label_text">State</span>
          {isUs ? (
            <>
              <DealsCreateDropdownSelect
                options={[
                  {
                    value: "",
                    label: usStatesLoading
                      ? "Loading states…"
                      : "Select state",
                  },
                  ...usStateOptionsForSelect,
                ]}
                value={usStateSelectValue}
                onChange={(v) => onChange({ state: v, city: "" })}
                disabled={usStatesLoading}
                invalid={Boolean(errors.state)}
                placeholder={
                  usStatesLoading ? "Loading states…" : "Select state"
                }
                searchable
                searchPlaceholder="Search states…"
                searchAriaLabel="Filter state list"
                searchShowOptionCountHint
                triggerClassName="asset_step_location_bordered"
              />
              {usLocationSource === "countriesNow" &&
              countriesNow.statesError ? (
                <p className="deals_create_field_hint deals_create_field_hint_warn" role="status">
                  Could not load states from the directory service. Using
                  offline list.
                </p>
              ) : null}
            </>
          ) : (
            <input
              className="deals_create_input asset_step_location_bordered"
              value={draft.state}
              onChange={(e) => onChange({ state: e.target.value })}
              aria-invalid={Boolean(errors.state)}
            />
          )}
          <FieldError message={errors.state} />
        </label>

        <label className="deals_create_label">
          <span className="deals_create_label_text">City</span>
          {isUs ? (
            <>
              <DealsCreateDropdownSelect
                options={[
                  {
                    value: "",
                    label: !usStateCode
                      ? "Select state first"
                      : usCitiesLoading
                        ? "Loading cities…"
                        : "Select city",
                  },
                  ...usCityOptionsForSelect,
                ]}
                value={draft.city.trim()}
                onChange={(v) => onChange({ city: v })}
                disabled={!usStateCode}
                invalid={Boolean(errors.city)}
                placeholder={
                  !usStateCode
                    ? "Select state first"
                    : usCitiesLoading
                      ? "Loading cities…"
                      : "Select city"
                }
                searchable
                searchPlaceholder="Search cities…"
                searchAriaLabel="Filter city list"
                searchShowOptionCountHint
                triggerClassName="asset_step_location_bordered"
              />
              {usLocationSource === "countriesNow" &&
              usStateCode &&
              countriesNow.citiesError ? (
                <p className="deals_create_field_hint deals_create_field_hint_warn" role="status">
                  Could not load cities from the directory service. Showing
                  offline list for this state.
                </p>
              ) : null}
            </>
          ) : (
            <input
              className="deals_create_input asset_step_location_bordered"
              value={draft.city}
              onChange={(e) => onChange({ city: e.target.value })}
              aria-invalid={Boolean(errors.city)}
            />
          )}
          <FieldError message={errors.city} />
        </label>

        <label className="deals_create_label asset_step_label_full">
          Street address line 1
          <input
            type="text"
            className="deals_create_input"
            value={draft.streetAddress1}
            onChange={(e) => onChange({ streetAddress1: e.target.value })}
            autoComplete="street-address"
          />
        </label>

        <label className="deals_create_label asset_step_label_full">
          Street address line 2
          <input
            className="deals_create_input"
            value={draft.streetAddress2}
            onChange={(e) => onChange({ streetAddress2: e.target.value })}
          />
        </label>

     

        <label className="deals_create_label asset_step_label_full">
          Zip code
          <input
            className="deals_create_input"
            value={draft.zipCode}
            onChange={(e) =>
              onChange({ zipCode: normalizeZipCodeDigits(e.target.value) })
            }
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={5}
            aria-invalid={Boolean(errors.zipCode)}
          />
          <FieldError message={errors.zipCode} />
        </label>

        <div className="asset_step_label_full asset_step_upload_block">
          <AssetImageUploadSection
            imageFiles={imageFiles}
            onImageFilesChange={onImageFilesChange}
            existingImageUrls={existingImageUrls}
            onRemoveExistingImage={onRemoveExistingImage}
            maxCount={ASSET_MAX_IMAGE_COUNT}
          />
        </div>
      </div>
    </section>
  )
}
