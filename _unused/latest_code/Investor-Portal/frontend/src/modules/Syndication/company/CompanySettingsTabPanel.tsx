import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { FormHeadingWithInfo } from "../../../common/components/form-heading/FormHeadingWithInfo";
import { normalizeDealGallerySrc } from "../../../common/utils/apiBaseUrl";
import {
  BrandingLocalPreviewImg,
  SettingsBrandedImage,
} from "./SettingsBrandedImage";
import {
  fetchWorkspaceTabSettings,
  materializeBrandingFile,
  MAX_BRANDING_FILE_BYTES,
  postCompanySettingsBranding,
  putWorkspaceTabSettings,
} from "./companyWorkspaceSettingsApi";
import { useDebouncedWorkspaceTabPersist } from "./useWorkspaceTabPersistence";
import type { LucideIcon } from "lucide-react";
import {
  Ban,
  Briefcase,
  Building2,
  Save,
  ChevronDown,
  CheckCircle2,
  ClipboardList,
  Copy,
  Image as ImageIcon,
  Images,
  Pencil,
  Loader2,
  Settings,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { CardRadioGroup } from "../../../common/components/CardRadioGroup/CardRadioGroup";
import { YesNoCardRadioGroup } from "../../../common/components/YesNoCardRadioGroup/YesNoCardRadioGroup";
import { toast } from "../../../common/components/Toast";
import "./company-settings-tab.css";

/**
 * Data-URL preview for a picked branding file. Uses materialized bytes (not `blob:`) so
 * Edge/Chrome and React Strict Mode do not show a blank preview after revoke races.
 */
function useBrandingFilePreviewUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (file == null) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    void materializeBrandingFile(file)
      .then((solid) => {
        if (cancelled) return;
        const reader = new FileReader();
        reader.onload = () => {
          if (!cancelled && typeof reader.result === "string") {
            setUrl(reader.result);
          }
        };
        reader.onerror = () => {
          if (!cancelled) setUrl(null);
        };
        reader.readAsDataURL(solid);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [file]);
  return url;
}

function isBrandingDraftPreview(
  editing: boolean,
  pendingRemoval: boolean,
  draft: File | null,
  objectUrl: string | null,
): boolean {
  return Boolean(editing && !pendingRemoval && draft && objectUrl);
}

function SettingsSectionHeading({
  id,
  Icon,
  children,
  description,
}: {
  id: string;
  Icon: LucideIcon;
  children: ReactNode;
  description?: string;
}) {
  return (
    <div className="cp_settings_section_head">
      <FormHeadingWithInfo
        as="h3"
        id={id}
        className="cp_settings_h3 cp_settings_h3_with_icon"
        leadingIcon={Icon}
        leadingIconClassName="cp_settings_h3_icon"
        title={children}
        info={description ? <p>{description}</p> : undefined}
      />
    </div>
  );
}

/** Field row label text only (icons only on section headings). */
function SettingsFieldLabel({ children }: { children: ReactNode }) {
  return (
    <div className="cp_settings_field_label um_view_field_head cp_settings_field_head">
      <span className="um_view_field_label">{children}</span>
    </div>
  );
}

function SettingsMediaItemLabel({
  title,
  description,
  Icon,
}: {
  title: string;
  description?: string;
  Icon?: LucideIcon;
}) {
  return (
    <div className="cp_settings_media_asset_head">
      {Icon ? (
        <span className="cp_settings_media_asset_icon" aria-hidden>
          <Icon size={16} strokeWidth={2} />
        </span>
      ) : null}
      <div className="cp_settings_media_asset_head_text">
        <span className="cp_settings_media_item_title">{title}</span>
        {description ? (
          <p className="cp_settings_media_item_desc">{description}</p>
        ) : null}
      </div>
    </div>
  );
}

function SettingsFieldEditActions({
  readOnly,
  editing,
  saveLabel = "Save",
  editAriaLabel = "Edit",
  onEdit,
  onSave,
  onCancel,
}: {
  readOnly?: boolean;
  editing: boolean;
  saveLabel?: string;
  editAriaLabel?: string;
  onEdit: () => void;
  onSave: () => void | Promise<void>;
  onCancel: () => void;
}) {
  if (readOnly) return null;
  if (editing) {
    return (
      <div className="cp_settings_row_actions um_modal_actions add_contact_modal_actions">
        <button type="button" className="um_btn_secondary" onClick={onCancel}>
          <X size={16} strokeWidth={2} aria-hidden />
          Close
        </button>
        <div className="add_contact_modal_actions_trailing">
          <button
            type="button"
            className="um_btn_primary"
            onClick={() => void onSave()}
          >
            <Save size={16} strokeWidth={2} aria-hidden />
            {saveLabel}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="cp_settings_row_actions">
      <button
        type="button"
        className="um_btn_secondary cp_settings_edit_btn"
        aria-label={editAriaLabel}
        onClick={onEdit}
      >
        <Pencil size={16} strokeWidth={2} aria-hidden />
        Edit
      </button>
    </div>
  );
}

const DEFAULT_DISTRIBUTION_TYPES = [
  "Individual",
  "LLC, corp, partnership, trust, solo 401(k), or checkbook IRA",
  "Joint tenancy",
  "Custodian IRA or custodian based 401(k)",
] as const;

function portalHostFromCompanyName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 48);
  return slug ? `invest.${slug}.capital` : "invest.yourcompany.com";
}

type Props = {
  initialCompanyName: string;
  /** When true, mutating controls are disabled (company member / view-only). */
  readOnly?: boolean;
  /** When set, registration / deal settings are loaded and saved per organization. */
  workspaceCompanyId?: string;
  /** After a successful name save: update session / directory so headers and other tabs match. */
  onCompanyDisplayNamePersisted?: (name: string) => void;
};

export function CompanySettingsTabPanel({
  initialCompanyName,
  readOnly = false,
  workspaceCompanyId,
  onCompanyDisplayNamePersisted,
}: Props) {
  const [companyName, setCompanyName] = useState(initialCompanyName);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(initialCompanyName);
  const prevInitialNameRef = useRef(initialCompanyName);

  const [qualificationEnabled, setQualificationEnabled] = useState(false);
  const [offeringsMode, setOfferingsMode] = useState("506c");
  const [emailVerifyBeforeInvest, setEmailVerifyBeforeInvest] = useState(true);
  const [primaryMemberInFunnel, setPrimaryMemberInFunnel] = useState(true);
  const [distributionTypes, setDistributionTypes] = useState<string[]>([
    ...DEFAULT_DISTRIBUTION_TYPES,
  ]);
  const [distributionDropdownOpen, setDistributionDropdownOpen] = useState(false);
  const distributionDropdownRef = useRef<HTMLDivElement>(null);

  const [editQualification, setEditQualification] = useState(false);
  const [qualDraft, setQualDraft] = useState(false);
  const [editOfferings, setEditOfferings] = useState(false);
  const [offeringsDraft, setOfferingsDraft] = useState("506c");
  const [editEmailVerify, setEditEmailVerify] = useState(false);
  const [emailVerifyDraft, setEmailVerifyDraft] = useState(true);
  const [editPrimaryMember, setEditPrimaryMember] = useState(false);
  const [primaryMemberDraft, setPrimaryMemberDraft] = useState(true);
  const [editDistribution, setEditDistribution] = useState(false);
  const [distributionDraft, setDistributionDraft] = useState<string[]>([]);
  const [editLogo, setEditLogo] = useState(false);
  const [editBg, setEditBg] = useState(false);
  const [editLogoIcon, setEditLogoIcon] = useState(false);

  /** Delivery URL (Cloudinary `https` or root-relative `/uploads/...`) from the API. */
  const [logoImageUrl, setLogoImageUrl] = useState<string | null>(null);
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(null);
  const [logoIconUrl, setLogoIconUrl] = useState<string | null>(null);
  /** Cloudinary public_id when the asset is stored in Cloud (see `SettingsBrandedImage`). */
  const [logoImagePublicId, setLogoImagePublicId] = useState<string | null>(null);
  const [backgroundImagePublicId, setBackgroundImagePublicId] = useState<string | null>(
    null,
  );
  const [logoIconPublicId, setLogoIconPublicId] = useState<string | null>(null);
  const [logoDraft, setLogoDraft] = useState<File | null>(null);
  const [bgDraft, setBgDraft] = useState<File | null>(null);
  const [iconDraft, setIconDraft] = useState<File | null>(null);
  const [logoPendingRemoval, setLogoPendingRemoval] = useState(false);
  const [bgPendingRemoval, setBgPendingRemoval] = useState(false);
  const [iconPendingRemoval, setIconPendingRemoval] = useState(false);
  const [logoPreviewLoadFailed, setLogoPreviewLoadFailed] = useState(false);
  const [bgPreviewLoadFailed, setBgPreviewLoadFailed] = useState(false);
  const [iconPreviewLoadFailed, setIconPreviewLoadFailed] = useState(false);

  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const bgFileInputRef = useRef<HTMLInputElement>(null);
  const iconFileInputRef = useRef<HTMLInputElement>(null);

  const logoDraftObjectUrl = useBrandingFilePreviewUrl(logoDraft);
  const bgDraftObjectUrl = useBrandingFilePreviewUrl(bgDraft);
  const iconDraftObjectUrl = useBrandingFilePreviewUrl(iconDraft);

  const logoPreviewSrc = useMemo(() => {
    if (editLogo) {
      if (logoPendingRemoval) return null;
      if (logoDraft) return logoDraftObjectUrl;
      if (logoImageUrl) return normalizeDealGallerySrc(logoImageUrl);
      return null;
    }
    if (logoImageUrl) return normalizeDealGallerySrc(logoImageUrl);
    return null;
  }, [
    editLogo,
    logoPendingRemoval,
    logoDraft,
    logoDraftObjectUrl,
    logoImageUrl,
  ]);

  const bgPreviewSrc = useMemo(() => {
    if (editBg) {
      if (bgPendingRemoval) return null;
      if (bgDraft) return bgDraftObjectUrl;
      if (backgroundImageUrl) return normalizeDealGallerySrc(backgroundImageUrl);
      return null;
    }
    if (backgroundImageUrl) return normalizeDealGallerySrc(backgroundImageUrl);
    return null;
  }, [
    editBg,
    bgPendingRemoval,
    bgDraft,
    bgDraftObjectUrl,
    backgroundImageUrl,
  ]);

  const iconPreviewSrc = useMemo(() => {
    if (editLogoIcon) {
      if (iconPendingRemoval) return null;
      if (iconDraft) return iconDraftObjectUrl;
      if (logoIconUrl) return normalizeDealGallerySrc(logoIconUrl);
      return null;
    }
    if (logoIconUrl) return normalizeDealGallerySrc(logoIconUrl);
    return null;
  }, [
    editLogoIcon,
    iconPendingRemoval,
    iconDraft,
    iconDraftObjectUrl,
    logoIconUrl,
  ]);

  useEffect(() => {
    setLogoPreviewLoadFailed(false);
  }, [logoPreviewSrc]);
  useEffect(() => {
    setBgPreviewLoadFailed(false);
  }, [bgPreviewSrc]);
  useEffect(() => {
    setIconPreviewLoadFailed(false);
  }, [iconPreviewSrc]);

  const [settingsHydrated, setSettingsHydrated] = useState(!workspaceCompanyId);
  const lastLoadedWorkspaceIdRef = useRef<string | null>(null);
  /**
   * Incremented after a successful media POST so an in‑flight `fetchWorkspaceTabSettings` from
   * initial page load does not `apply` older payload and wipe freshly uploaded URLs/public ids.
   */
  const brandingUploadEpochRef = useRef(0);

  /**
   * `company_workspace_tab_settings` (tab: `settings`) `payload` keys & UI blocks:
   * - `logoImageUrl` / `logoImagePublicId`  → "Logo" (`SettingsBrandedImage` + `url-gen` when needed)
   * - `backgroundImageUrl` / `backgroundImagePublicId` → "Background image"
   * - `logoIconUrl` / `logoIconPublicId`   → "Logo icon"
   */
  const applySettingsMediaFromPayload = useCallback((p: Record<string, unknown>) => {
    if (typeof p.logoImageUrl === "string" && p.logoImageUrl.trim()) {
      setLogoImageUrl(p.logoImageUrl.trim());
    } else {
      setLogoImageUrl(null);
    }
    if (typeof p.logoImagePublicId === "string" && p.logoImagePublicId.trim()) {
      setLogoImagePublicId(p.logoImagePublicId.trim());
    } else {
      setLogoImagePublicId(null);
    }
    if (typeof p.backgroundImageUrl === "string" && p.backgroundImageUrl.trim()) {
      setBackgroundImageUrl(p.backgroundImageUrl.trim());
    } else {
      setBackgroundImageUrl(null);
    }
    if (typeof p.backgroundImagePublicId === "string" && p.backgroundImagePublicId.trim()) {
      setBackgroundImagePublicId(p.backgroundImagePublicId.trim());
    } else {
      setBackgroundImagePublicId(null);
    }
    const iconP = p as Record<string, unknown>;
    const fromIconUrl =
      typeof p.logoIconUrl === "string" && p.logoIconUrl.trim()
        ? p.logoIconUrl.trim()
        : "";
    const fromLogoIcon =
      typeof iconP.logoIcon === "string" && String(iconP.logoIcon).trim()
        ? String(iconP.logoIcon).trim()
        : "";
    if (fromIconUrl || fromLogoIcon) {
      setLogoIconUrl(fromIconUrl || fromLogoIcon);
    } else {
      setLogoIconUrl(null);
    }
    if (typeof p.logoIconPublicId === "string" && p.logoIconPublicId.trim()) {
      setLogoIconPublicId(p.logoIconPublicId.trim());
    } else {
      setLogoIconPublicId(null);
    }
  }, []);

  useEffect(() => {
    if (!workspaceCompanyId) {
      setSettingsHydrated(true);
      lastLoadedWorkspaceIdRef.current = null;
      return;
    }
    const prevWorkspace = lastLoadedWorkspaceIdRef.current;
    if (prevWorkspace !== workspaceCompanyId) {
      setLogoImageUrl(null);
      setBackgroundImageUrl(null);
      setLogoIconUrl(null);
      setLogoImagePublicId(null);
      setBackgroundImagePublicId(null);
      setLogoIconPublicId(null);
      lastLoadedWorkspaceIdRef.current = workspaceCompanyId;
    }
    let cancelled = false;
    setSettingsHydrated(false);
    void (async () => {
      const epochAtStart = brandingUploadEpochRef.current;
      const { ok, payload: p } = await fetchWorkspaceTabSettings(
        workspaceCompanyId,
        "settings",
      );
      if (cancelled) {
        setSettingsHydrated(true);
        return;
      }
      if (ok) {
        if (typeof p.qualificationEnabled === "boolean") {
          setQualificationEnabled(p.qualificationEnabled);
        }
        if (
          typeof p.offeringsMode === "string" &&
          ["506c", "all", "506b"].includes(p.offeringsMode)
        ) {
          setOfferingsMode(p.offeringsMode);
        }
        if (typeof p.emailVerifyBeforeInvest === "boolean") {
          setEmailVerifyBeforeInvest(p.emailVerifyBeforeInvest);
        }
        if (typeof p.primaryMemberInFunnel === "boolean") {
          setPrimaryMemberInFunnel(p.primaryMemberInFunnel);
        }
        if (Array.isArray(p.distributionTypes)) {
          const next = p.distributionTypes.filter(
            (x): x is string => typeof x === "string",
          );
          if (next.length > 0) {
            setDistributionTypes(next);
          }
        }
        /**
         * If a media POST just ran, this GET may be older; applying its logo/icon URLs would
         * wipe the React state that `onSave` already set from the upload.
         * Non-media fields from `p` are still safe to apply.
         */
        if (epochAtStart === brandingUploadEpochRef.current) {
          applySettingsMediaFromPayload(p);
        }
      }
      setSettingsHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceCompanyId, applySettingsMediaFromPayload]);

  const settingsPayload = useMemo(
    () => ({
      qualificationEnabled,
      offeringsMode,
      emailVerifyBeforeInvest,
      primaryMemberInFunnel,
      distributionTypes,
      logoImageUrl,
      backgroundImageUrl,
      logoIconUrl,
    }),
    [
      qualificationEnabled,
      offeringsMode,
      emailVerifyBeforeInvest,
      primaryMemberInFunnel,
      distributionTypes,
      logoImageUrl,
      backgroundImageUrl,
      logoIconUrl,
    ],
  );

  /**
   * Debounced auto-save must never include logo/background/icon URL fields. They are only
   * written from each section’s Save (or clear) flow. Otherwise `null` in React state — e.g. after
   * a failed GET or before hydration — was merged on the server and overwrote real paths in the DB.
   */
  const autoPersistSettingsPayload = useMemo((): Record<string, unknown> => {
    const p: Record<string, unknown> = { ...settingsPayload };
    delete p.logoImageUrl;
    delete p.backgroundImageUrl;
    delete p.logoIconUrl;
    return p;
  }, [settingsPayload]);

  useDebouncedWorkspaceTabPersist(
    workspaceCompanyId,
    "settings",
    readOnly,
    settingsHydrated,
    autoPersistSettingsPayload,
  );

  /* Sync from parent only when `initialCompanyName` actually changes — not when `editingName`
   * toggles (Save used to reset the field back to the stale prop). */
  useEffect(() => {
    if (prevInitialNameRef.current === initialCompanyName) return;
    prevInitialNameRef.current = initialCompanyName;
    setCompanyName(initialCompanyName);
    if (!editingName) {
      setNameDraft(initialCompanyName);
    }
  }, [initialCompanyName, editingName]);

  useEffect(() => {
    if (!readOnly) return;
    setEditingName(false);
    setNameDraft(companyName);
    setEditQualification(false);
    setEditOfferings(false);
    setEditEmailVerify(false);
    setEditPrimaryMember(false);
    setEditDistribution(false);
    setEditLogo(false);
    setEditBg(false);
    setEditLogoIcon(false);
    setDistributionDropdownOpen(false);
  }, [readOnly, companyName]);

  const portalHost = useMemo(
    () => portalHostFromCompanyName(companyName),
    [companyName],
  );

  const mediaBrandingLoading = Boolean(workspaceCompanyId) && !settingsHydrated;

  const distributionTypesForUi = editDistribution
    ? distributionDraft
    : distributionTypes;

  const distributionAllSelected = useMemo(
    () =>
      distributionTypesForUi.length === DEFAULT_DISTRIBUTION_TYPES.length &&
      DEFAULT_DISTRIBUTION_TYPES.every((t) => distributionTypesForUi.includes(t)),
    [distributionTypesForUi],
  );

  const distributionSummary = useMemo(() => {
    if (distributionTypesForUi.length === 0) {
      return "Select profile types…";
    }
    if (distributionAllSelected) {
      return "All profile types";
    }
    if (distributionTypesForUi.length === 1) {
      return distributionTypesForUi[0] ?? "";
    }
    return `${distributionTypesForUi.length} profile types selected`;
  }, [distributionAllSelected, distributionTypesForUi]);

  useEffect(() => {
    if (!distributionDropdownOpen) return;
    function onPointerDown(e: PointerEvent) {
      const root = distributionDropdownRef.current;
      if (!root || !(e.target instanceof Node) || root.contains(e.target)) {
        return;
      }
      setDistributionDropdownOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDistributionDropdownOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [distributionDropdownOpen]);

  useEffect(() => {
    if (!editDistribution) setDistributionDropdownOpen(false);
  }, [editDistribution]);

  async function copyPortalLink() {
    try {
      await navigator.clipboard.writeText(portalHost);
      toast.success("Copied", "Portal link copied to clipboard.");
    } catch {
      toast.error("Copy failed", "Could not copy to clipboard.");
    }
  }

  function isLikelyImageFile(f: File): boolean {
    if (f.type && f.type.startsWith("image/")) return true;
    return /\.(png|jpe?g|gif|webp|svg|ico|avif|bmp|heic|heif)$/i.test(
      f.name || "",
    );
  }

  function applySingleImageFromInput(
    e: ChangeEvent<HTMLInputElement>,
    setDraft: (file: File | null) => void,
  ) {
    const list = e.target.files;
    const f = list?.length ? list.item(0) : null;
    e.target.value = "";
    if (!f) return;
    if (!isLikelyImageFile(f)) {
      toast.error("Invalid file", "Please choose an image file (PNG, JPEG, SVG, ICO, etc.).");
      return;
    }
    if (f.size > MAX_BRANDING_FILE_BYTES) {
      toast.error("File too large", "Maximum file size is 1 MB.");
      return;
    }
    void materializeBrandingFile(f)
      .then((solid) => setDraft(solid))
      .catch((err) => {
        const msg =
          err instanceof Error && err.message
            ? err.message
            : "Could not read the selected file.";
        toast.error("Invalid file", msg);
      });
  }

  /** Only one of logo / background / icon may be in edit mode; each section holds at most one file. */
  function exitOtherMediaEdits(active: "logo" | "bg" | "icon") {
    if (active !== "logo") {
      setEditLogo(false);
      setLogoDraft(null);
      setLogoPendingRemoval(false);
    }
    if (active !== "bg") {
      setEditBg(false);
      setBgDraft(null);
      setBgPendingRemoval(false);
    }
    if (active !== "icon") {
      setEditLogoIcon(false);
      setIconDraft(null);
      setIconPendingRemoval(false);
    }
  }

  return (
    <div className="cp_settings_root">
      <header className="cp_settings_header">
        <h2 className="cp_settings_title">Workspace settings</h2>
        <p className="cp_settings_page_lead">
          Configure your organization name, investor registration, deal defaults, and branding
          for the company portal. Changes apply to this workspace and are saved to your company
          record.
        </p>
      </header>

      <div className="cp_settings_stack">
      <section className="cp_settings_section" aria-labelledby="cp-gen-settings">
        <SettingsSectionHeading
          id="cp-gen-settings"
          Icon={Settings}
          description="Identity and portal link for the company workspace you are signed into."
        >
          General settings
        </SettingsSectionHeading>
        <div className="cp_settings_fields">
        <div className="cp_settings_row cp_settings_row_general">
          <div className="cp_settings_label_col">
            <SettingsFieldLabel>Company name</SettingsFieldLabel>
          </div>
          <div className="cp_settings_control">
            <div className="cp_settings_value_row cp_settings_name_edit_row">
              <input
                type="text"
                className="cp_settings_field_input"
                value={editingName ? nameDraft : companyName}
                disabled={readOnly || !editingName}
                onChange={(e) => setNameDraft(e.target.value)}
                aria-label="Company name"
              />
              <SettingsFieldEditActions
                readOnly={readOnly}
                editing={editingName}
                editAriaLabel="Edit company name"
                onEdit={() => {
                  setNameDraft(companyName);
                  setEditingName(true);
                }}
                onSave={() => {
                  const next = nameDraft.trim() || companyName;
                  setCompanyName(next);
                  setNameDraft(next);
                  setEditingName(false);
                  onCompanyDisplayNamePersisted?.(next);
                  toast.success("Saved", "Company name updated.");
                }}
                onCancel={() => {
                  setNameDraft(companyName);
                  setEditingName(false);
                }}
              />
            </div>
          </div>
        </div>
        <div className="cp_settings_row cp_settings_row_spaced cp_settings_row_general">
          <div className="cp_settings_label_col">
            <SettingsFieldLabel>Company portal link</SettingsFieldLabel>
          </div>
          <div className="cp_settings_control">
            <div className="cp_settings_value_row">
              <div className="um_view_field_box cp_settings_readonly_pill cp_settings_portal_mono">
                {portalHost}
              </div>
              <button
                type="button"
                className="um_btn_secondary"
                onClick={() => void copyPortalLink()}
              >
                <Copy size={16} strokeWidth={2} aria-hidden />
                Copy to clipboard
              </button>
            </div>
          </div>
        </div>
        </div>
      </section>

      <section className="cp_settings_section" aria-labelledby="cp-reg-settings">
        <SettingsSectionHeading
          id="cp-reg-settings"
          Icon={ClipboardList}
          description="Control how investors register and which offerings they can see on your portal."
        >
          Registration settings
        </SettingsSectionHeading>
        <div className="cp_settings_fields">
        <div className="cp_settings_row">
          <div className="cp_settings_label_col">
            <SettingsFieldLabel>Investor qualification form</SettingsFieldLabel>
          </div>
          <div className="cp_settings_control">
            <div className="cp_settings_value_row">
              <div className="cp_settings_edit_field_block">
                <CardRadioGroup
                  name="cp-qual"
                  value={
                    (editQualification ? qualDraft : qualificationEnabled)
                      ? "enabled"
                      : "disabled"
                  }
                  onChange={(v) => setQualDraft(v === "enabled")}
                  ariaLabel="Investor qualification form"
                  disabled={readOnly || !editQualification}
                  options={[
                    { value: "enabled", label: "Enabled", icon: CheckCircle2 },
                    { value: "disabled", label: "Disabled", icon: Ban },
                  ]}
                />
                <button
                  type="button"
                  className="cp_btn_customize"
                  disabled={readOnly || !editQualification}
                >
                  <Pencil size={16} strokeWidth={2} aria-hidden />
                  Customize qualification form
                </button>
              </div>
              <SettingsFieldEditActions
                readOnly={readOnly}
                editing={editQualification}
                editAriaLabel="Edit investor qualification form"
                onEdit={() => {
                  setQualDraft(qualificationEnabled);
                  setEditQualification(true);
                }}
                onSave={() => {
                  setQualificationEnabled(qualDraft);
                  setEditQualification(false);
                  toast.success("Saved", "Investor qualification form setting updated.");
                }}
                onCancel={() => setEditQualification(false)}
              />
            </div>
          </div>
        </div>
        <div className="cp_settings_row cp_settings_row_spaced">
          <div className="cp_settings_label_col">
            <SettingsFieldLabel>Automatically show offerings</SettingsFieldLabel>
          </div>
          <div className="cp_settings_control">
            <div className="cp_settings_value_row">
              <select
                className="um_field_select cp_settings_select cp_settings_input_pill"
                value={editOfferings ? offeringsDraft : offeringsMode}
                disabled={readOnly || !editOfferings}
                onChange={(e) => setOfferingsDraft(e.target.value)}
                aria-label="Automatically show offerings"
              >
                <option value="506c">Show only 506c offerings</option>
                <option value="all">Show all offerings</option>
                <option value="506b">Show only 506(b) offerings</option>
              </select>
              <SettingsFieldEditActions
                readOnly={readOnly}
                editing={editOfferings}
                editAriaLabel="Edit automatically show offerings"
                onEdit={() => {
                  setOfferingsDraft(offeringsMode);
                  setEditOfferings(true);
                }}
                onSave={() => {
                  setOfferingsMode(offeringsDraft);
                  setEditOfferings(false);
                  toast.success("Saved", "Offering visibility updated.");
                }}
                onCancel={() => setEditOfferings(false)}
              />
            </div>
          </div>
        </div>
        </div>
      </section>

      <section className="cp_settings_section" aria-labelledby="cp-deal-settings">
        <SettingsSectionHeading
          id="cp-deal-settings"
          Icon={Briefcase}
          description="Defaults applied across deals in this workspace."
        >
          Global deal settings
        </SettingsSectionHeading>
        <div className="cp_settings_fields">
        <div className="cp_settings_row">
          <div className="cp_settings_label_col">
            <SettingsFieldLabel>Require email verification before investing</SettingsFieldLabel>
          </div>
          <div className="cp_settings_control">
            <div className="cp_settings_value_row">
              <div className="cp_settings_edit_field_block">
                <YesNoCardRadioGroup
                  name="cp-email-verify"
                  value={
                    (editEmailVerify ? emailVerifyDraft : emailVerifyBeforeInvest)
                      ? "yes"
                      : "no"
                  }
                  onChange={(v) => setEmailVerifyDraft(v === "yes")}
                  yesLabel="Yes (most common)"
                  variant="mail"
                  ariaLabel="Require email verification before investing"
                  disabled={readOnly || !editEmailVerify}
                />
              </div>
              <SettingsFieldEditActions
                readOnly={readOnly}
                editing={editEmailVerify}
                editAriaLabel="Edit email verification requirement"
                onEdit={() => {
                  setEmailVerifyDraft(emailVerifyBeforeInvest);
                  setEditEmailVerify(true);
                }}
                onSave={() => {
                  setEmailVerifyBeforeInvest(emailVerifyDraft);
                  setEditEmailVerify(false);
                  toast.success("Saved", "Email verification setting updated.");
                }}
                onCancel={() => setEditEmailVerify(false)}
              />
            </div>
          </div>
        </div>
        <div className="cp_settings_row cp_settings_row_spaced">
          <div className="cp_settings_label_col">
            <SettingsFieldLabel>
              Allow investors to select primary company member in investment funnel
            </SettingsFieldLabel>
          </div>
          <div className="cp_settings_control">
            <div className="cp_settings_value_row">
              <div className="cp_settings_edit_field_block">
                <YesNoCardRadioGroup
                  name="cp-primary-member"
                  value={
                    (editPrimaryMember ? primaryMemberDraft : primaryMemberInFunnel)
                      ? "yes"
                      : "no"
                  }
                  onChange={(v) => setPrimaryMemberDraft(v === "yes")}
                  ariaLabel="Allow investors to select primary company member in investment funnel"
                  disabled={readOnly || !editPrimaryMember}
                />
              </div>
              <SettingsFieldEditActions
                readOnly={readOnly}
                editing={editPrimaryMember}
                editAriaLabel="Edit primary company member in funnel"
                onEdit={() => {
                  setPrimaryMemberDraft(primaryMemberInFunnel);
                  setEditPrimaryMember(true);
                }}
                onSave={() => {
                  setPrimaryMemberInFunnel(primaryMemberDraft);
                  setEditPrimaryMember(false);
                  toast.success("Saved", "Primary member setting updated.");
                }}
                onCancel={() => setEditPrimaryMember(false)}
              />
            </div>
          </div>
        </div>
        <div className="cp_settings_row cp_settings_row_spaced">
          <div className="cp_settings_label_col">
            <SettingsFieldLabel>
              Allow these profile types to request distributions by checks
            </SettingsFieldLabel>
          </div>
          <div className="cp_settings_control">
            <div className="cp_settings_value_row">
              <div
                className="cp_distribution_select_root"
                ref={distributionDropdownRef}
              >
                <button
                  type="button"
                  id="cp-distribution-trigger"
                  className="cp_distribution_select_trigger"
                  aria-expanded={distributionDropdownOpen}
                  aria-haspopup="listbox"
                  aria-controls="cp-distribution-listbox"
                  disabled={readOnly || !editDistribution}
                  onClick={() =>
                    setDistributionDropdownOpen((open) => !open)
                  }
                >
                  <span className="cp_distribution_select_value">
                    {distributionSummary}
                  </span>
                  <ChevronDown
                    size={18}
                    strokeWidth={2}
                    className={
                      distributionDropdownOpen
                        ? "cp_distribution_select_chevron cp_distribution_select_chevron_open"
                        : "cp_distribution_select_chevron"
                    }
                    aria-hidden
                  />
                </button>
                {distributionDropdownOpen ? (
                  <div
                    id="cp-distribution-listbox"
                    className="cp_distribution_select_panel"
                    role="listbox"
                    aria-label="Profile types"
                    aria-multiselectable="true"
                  >
                    <label
                      className="cp_distribution_select_row cp_distribution_select_row_all"
                      role="option"
                      aria-selected={distributionAllSelected}
                    >
                      <input
                        type="checkbox"
                        className="cp_distribution_select_checkbox"
                        checked={distributionAllSelected}
                        disabled={readOnly || !editDistribution}
                        onChange={() => {
                          if (distributionAllSelected) {
                            setDistributionDraft([]);
                          } else {
                            setDistributionDraft([...DEFAULT_DISTRIBUTION_TYPES]);
                          }
                        }}
                      />
                      <span className="cp_distribution_select_row_label">
                        All profile types
                      </span>
                    </label>
                    <div className="cp_distribution_select_divider" aria-hidden />
                    {DEFAULT_DISTRIBUTION_TYPES.map((t) => {
                      const checked = distributionTypesForUi.includes(t);
                      return (
                        <label
                          key={t}
                          className="cp_distribution_select_row"
                          role="option"
                          aria-selected={checked}
                        >
                          <input
                            type="checkbox"
                            className="cp_distribution_select_checkbox"
                            checked={checked}
                            disabled={readOnly || !editDistribution}
                            onChange={() => {
                              setDistributionDraft((prev) =>
                                checked
                                  ? prev.filter((x) => x !== t)
                                  : [...prev, t],
                              );
                            }}
                          />
                          <span className="cp_distribution_select_row_label">
                            {t}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : null}
              </div>
              <SettingsFieldEditActions
                readOnly={readOnly}
                editing={editDistribution}
                editAriaLabel="Edit distribution profile types"
                onEdit={() => {
                  setDistributionDraft([...distributionTypes]);
                  setEditDistribution(true);
                }}
                onSave={() => {
                  setDistributionTypes([...distributionDraft]);
                  setEditDistribution(false);
                  setDistributionDropdownOpen(false);
                  toast.success("Saved", "Distribution profile types updated.");
                }}
                onCancel={() => {
                  setEditDistribution(false);
                  setDistributionDropdownOpen(false);
                }}
              />
            </div>
          </div>
        </div>
        </div>
      </section>

      <section
        className="cp_settings_section cp_settings_org_assets_section"
        aria-labelledby="cp-org-assets"
      >
        <SettingsSectionHeading
          id="cp-org-assets"
          Icon={Images}
          description="Logo, background, and icon used on your deals, offerings, and company portal."
        >
          Org assets
        </SettingsSectionHeading>
        <div className="cp_settings_media_grid">
          <article className="cp_settings_media_asset_card">
            <SettingsMediaItemLabel
              Icon={Building2}
              title="Logo"
              description="Displayed on your deals, offerings, and company portal."
            />
            <div className="cp_settings_media_asset_preview">
                <input
                  ref={logoFileInputRef}
                  type="file"
                  accept="image/*"
                  multiple={false}
                  className="cp_settings_hidden_file_input"
                  aria-hidden
                  tabIndex={-1}
                  onChange={(e) => {
                    applySingleImageFromInput(e, (file) => {
                      setLogoDraft(file);
                      if (file) {
                        setLogoPendingRemoval(false);
                        setLogoPreviewLoadFailed(false);
                      }
                    });
                  }}
                />
                <div
                  className={`cp_media_preview cp_media_preview_logo${(logoImagePublicId || logoPreviewSrc) && !logoPreviewLoadFailed && !mediaBrandingLoading ? " cp_media_preview_has_image" : ""}`}
                >
                  {mediaBrandingLoading ? (
                    <div
                      className="cp_settings_branding_preview_loading"
                      role="status"
                      aria-live="polite"
                    >
                      <Loader2
                        className="cp_settings_branding_preview_spinner"
                        size={28}
                        strokeWidth={1.75}
                        aria-hidden
                      />
                      <span>Loading preview…</span>
                    </div>
                  ) : (logoImagePublicId ||
                    logoPreviewSrc ||
                    (editLogo && logoDraft && !logoPendingRemoval)) &&
                    !logoPreviewLoadFailed ? (
                    isBrandingDraftPreview(
                      editLogo,
                      logoPendingRemoval,
                      logoDraft,
                      logoDraftObjectUrl,
                    ) ? (
                      logoDraftObjectUrl ? (
                        <BrandingLocalPreviewImg
                          src={logoDraftObjectUrl}
                          alt="Company logo preview"
                          className="cp_media_preview_img cp_media_preview_img_logo"
                        />
                      ) : (
                        <Loader2
                          className="cp_settings_branding_preview_spinner"
                          size={28}
                          strokeWidth={1.75}
                          aria-label="Loading preview"
                        />
                      )
                    ) : (
                      <SettingsBrandedImage
                        publicId={logoImagePublicId}
                        url={logoImageUrl ?? ""}
                        alt="Company logo preview"
                        className="cp_media_preview_img cp_media_preview_img_logo"
                        onError={() => setLogoPreviewLoadFailed(true)}
                        reactKey={logoImagePublicId ?? logoPreviewSrc ?? "logo"}
                      />
                    )
                  ) : (
                    <>
                      <Building2 size={32} strokeWidth={1.5} aria-hidden />
                      <span className="cp_media_preview_label">{companyName}</span>
                    </>
                  )}
                </div>
                {editLogo && logoDraft && !readOnly ? (
                  <p className="cp_settings_media_selected_file" title={logoDraft.name}>
                    {logoDraft.name}
                  </p>
                ) : null}
            </div>
            <footer className="cp_settings_media_asset_footer">
              <div className="cp_settings_media_toolbar" aria-label="Logo actions">
                <SettingsFieldEditActions
                readOnly={readOnly}
                editing={editLogo}
                editAriaLabel="Edit company logo"
                onEdit={() => {
                  exitOtherMediaEdits("logo");
                  setLogoPendingRemoval(false);
                  setLogoDraft(null);
                  setLogoPreviewLoadFailed(false);
                  setEditLogo(true);
                }}
                onSave={async () => {
                  if (readOnly || !workspaceCompanyId) {
                    toast.error("Error", "Company workspace is not available.");
                    return;
                  }
                  let nextLogo: string | null = logoImageUrl;
                  if (logoPendingRemoval) {
                    nextLogo = null;
                  } else if (logoDraft) {
                    const up = await postCompanySettingsBranding(
                      workspaceCompanyId,
                      "logo",
                      logoDraft,
                    );
                    if (!up.ok) {
                      toast.error("Upload failed", up.message);
                      return;
                    }
                    brandingUploadEpochRef.current += 1;
                    nextLogo = up.url;
                    if (up.publicId) setLogoImagePublicId(up.publicId);
                    else setLogoImagePublicId(null);
                  }
                  setLogoImageUrl(nextLogo);
                  setLogoDraft(null);
                  setLogoPendingRemoval(false);
                  setEditLogo(false);
                  // Only `logoImageUrl` here — never pass sibling media URLs from React state or a
                  // `null` here would merge over DB values when state is stale (e.g. 502 on load).
                  const put = await putWorkspaceTabSettings(workspaceCompanyId, "settings", {
                    qualificationEnabled,
                    offeringsMode,
                    emailVerifyBeforeInvest,
                    primaryMemberInFunnel,
                    distributionTypes,
                    logoImageUrl: nextLogo,
                    logoImagePublicId: nextLogo ? undefined : null,
                  });
                  if (put.ok) {
                    const fresh = await fetchWorkspaceTabSettings(
                      workspaceCompanyId,
                      "settings",
                    );
                    if (fresh.ok) applySettingsMediaFromPayload(fresh.payload);
                    toast.success("Saved", "Company logo updated.");
                    window.dispatchEvent(new Event("company-branding-updated"));
                  } else {
                    toast.error("Save failed", put.message);
                  }
                }}
                onCancel={() => {
                  setLogoDraft(null);
                  setLogoPendingRemoval(false);
                  setEditLogo(false);
                }}
              />
                {editLogo && !readOnly ? (
                  <div className="cp_media_actions">
                    <button
                      type="button"
                      className="um_btn_secondary"
                      onClick={() => logoFileInputRef.current?.click()}
                    >
                      <Upload size={16} strokeWidth={2} aria-hidden />
                      Upload new
                    </button>
                    <button
                      type="button"
                      className="um_btn_secondary"
                      disabled={
                        !logoDraft && !logoImageUrl && !logoPendingRemoval
                      }
                      onClick={() => {
                        if (logoDraft) {
                          setLogoDraft(null);
                          return;
                        }
                        if (logoPendingRemoval) {
                          setLogoPendingRemoval(false);
                          return;
                        }
                        if (logoImageUrl) setLogoPendingRemoval(true);
                      }}
                    >
                      <Trash2 size={16} strokeWidth={2} aria-hidden />
                      {logoPendingRemoval && !logoDraft
                        ? "Undo remove"
                        : "Delete"}
                    </button>
                  </div>
                ) : null}
              </div>
            </footer>
          </article>

          <article className="cp_settings_media_asset_card">
            <SettingsMediaItemLabel
              Icon={Images}
              title="Background image"
              description="Optional high-resolution image for your company portal login page."
            />
            <div className="cp_settings_media_asset_preview">
                <input
                  ref={bgFileInputRef}
                  type="file"
                  accept="image/*"
                  multiple={false}
                  className="cp_settings_hidden_file_input"
                  aria-hidden
                  tabIndex={-1}
                  onChange={(e) => {
                    applySingleImageFromInput(e, (file) => {
                      setBgDraft(file);
                      if (file) {
                        setBgPendingRemoval(false);
                        setBgPreviewLoadFailed(false);
                      }
                    });
                  }}
                />
                <div
                  className={`cp_media_preview cp_media_preview_bg${
                    (backgroundImagePublicId || bgPreviewSrc) && !bgPreviewLoadFailed && !mediaBrandingLoading
                      ? " cp_media_preview_has_image"
                      : ""
                  }`}
                  role={
                    (backgroundImagePublicId || bgPreviewSrc) && !bgPreviewLoadFailed && !mediaBrandingLoading
                      ? undefined
                      : "img"
                  }
                  aria-label={
                    (backgroundImagePublicId || bgPreviewSrc) && !bgPreviewLoadFailed && !mediaBrandingLoading
                      ? undefined
                      : "Background preview placeholder"
                  }
                >
                  {mediaBrandingLoading ? (
                    <div
                      className="cp_settings_branding_preview_loading"
                      role="status"
                      aria-live="polite"
                    >
                      <Loader2
                        className="cp_settings_branding_preview_spinner"
                        size={28}
                        strokeWidth={1.75}
                        aria-hidden
                      />
                      <span>Loading preview…</span>
                    </div>
                  ) : (backgroundImagePublicId ||
                    bgPreviewSrc ||
                    (editBg && bgDraft && !bgPendingRemoval)) &&
                    !bgPreviewLoadFailed ? (
                    isBrandingDraftPreview(
                      editBg,
                      bgPendingRemoval,
                      bgDraft,
                      bgDraftObjectUrl,
                    ) ? (
                      bgDraftObjectUrl ? (
                        <BrandingLocalPreviewImg
                          src={bgDraftObjectUrl}
                          alt="Background image preview"
                          className="cp_media_preview_img cp_media_preview_img_bg"
                        />
                      ) : (
                        <Loader2
                          className="cp_settings_branding_preview_spinner"
                          size={28}
                          strokeWidth={1.75}
                          aria-label="Loading preview"
                        />
                      )
                    ) : (
                      <SettingsBrandedImage
                        publicId={backgroundImagePublicId}
                        url={backgroundImageUrl ?? ""}
                        alt="Background image preview"
                        className="cp_media_preview_img cp_media_preview_img_bg"
                        onError={() => setBgPreviewLoadFailed(true)}
                        reactKey={backgroundImagePublicId ?? bgPreviewSrc ?? "background"}
                      />
                    )
                  ) : (
                    <div className="cp_media_preview_empty">
                      <Images size={32} strokeWidth={1.5} aria-hidden />
                      <span>No background set</span>
                    </div>
                  )}
                </div>
                {editBg && bgDraft && !readOnly ? (
                  <p className="cp_settings_media_selected_file" title={bgDraft.name}>
                    {bgDraft.name}
                  </p>
                ) : null}
            </div>
            <footer className="cp_settings_media_asset_footer">
              <div className="cp_settings_media_toolbar" aria-label="Background image actions">
                <SettingsFieldEditActions
                readOnly={readOnly}
                editing={editBg}
                editAriaLabel="Edit background image"
                onEdit={() => {
                  exitOtherMediaEdits("bg");
                  setBgPendingRemoval(false);
                  setBgDraft(null);
                  setBgPreviewLoadFailed(false);
                  setEditBg(true);
                }}
                onSave={async () => {
                  if (readOnly || !workspaceCompanyId) {
                    toast.error("Error", "Company workspace is not available.");
                    return;
                  }
                  let nextBg: string | null = backgroundImageUrl;
                  if (bgPendingRemoval) {
                    nextBg = null;
                  } else if (bgDraft) {
                    const up = await postCompanySettingsBranding(
                      workspaceCompanyId,
                      "background",
                      bgDraft,
                    );
                    if (!up.ok) {
                      toast.error("Upload failed", up.message);
                      return;
                    }
                    brandingUploadEpochRef.current += 1;
                    nextBg = up.url;
                    if (up.publicId) setBackgroundImagePublicId(up.publicId);
                    else setBackgroundImagePublicId(null);
                  }
                  setBackgroundImageUrl(nextBg);
                  setBgDraft(null);
                  setBgPendingRemoval(false);
                  setEditBg(false);
                  const put = await putWorkspaceTabSettings(workspaceCompanyId, "settings", {
                    qualificationEnabled,
                    offeringsMode,
                    emailVerifyBeforeInvest,
                    primaryMemberInFunnel,
                    distributionTypes,
                    backgroundImageUrl: nextBg,
                    backgroundImagePublicId: nextBg ? undefined : null,
                  });
                  if (put.ok) {
                    const fresh = await fetchWorkspaceTabSettings(
                      workspaceCompanyId,
                      "settings",
                    );
                    if (fresh.ok) applySettingsMediaFromPayload(fresh.payload);
                    toast.success("Saved", "Background image updated.");
                    window.dispatchEvent(new Event("company-branding-updated"));
                  } else {
                    toast.error("Save failed", put.message);
                  }
                }}
                onCancel={() => {
                  setBgDraft(null);
                  setBgPendingRemoval(false);
                  setEditBg(false);
                }}
              />
                {editBg && !readOnly ? (
                  <div className="cp_media_actions">
                    <button
                      type="button"
                      className="um_btn_secondary"
                      onClick={() => bgFileInputRef.current?.click()}
                    >
                      <Upload size={16} strokeWidth={2} aria-hidden />
                      Upload new
                    </button>
                    <button
                      type="button"
                      className="um_btn_secondary"
                      disabled={
                        !bgDraft && !backgroundImageUrl && !bgPendingRemoval
                      }
                      onClick={() => {
                        if (bgDraft) {
                          setBgDraft(null);
                          return;
                        }
                        if (bgPendingRemoval) {
                          setBgPendingRemoval(false);
                          return;
                        }
                        if (backgroundImageUrl) setBgPendingRemoval(true);
                      }}
                    >
                      <Trash2 size={16} strokeWidth={2} aria-hidden />
                      {bgPendingRemoval && !bgDraft
                        ? "Undo remove"
                        : "Delete"}
                    </button>
                  </div>
                ) : null}
              </div>
            </footer>
          </article>

          <article className="cp_settings_media_asset_card">
            <SettingsMediaItemLabel
              Icon={ImageIcon}
              title="Logo icon"
              description="Smaller logo for the browser tab and collapsed sidebar."
            />
            <div className="cp_settings_media_asset_preview">
                <input
                  ref={iconFileInputRef}
                  type="file"
                  accept="image/*,.ico,image/x-icon,image/vnd.microsoft.icon"
                  multiple={false}
                  className="cp_settings_hidden_file_input"
                  aria-hidden
                  tabIndex={-1}
                  onChange={(e) => {
                    applySingleImageFromInput(e, (file) => {
                      setIconDraft(file);
                      if (file) {
                        setIconPendingRemoval(false);
                        setIconPreviewLoadFailed(false);
                      }
                    });
                  }}
                />
                <div
                  className={`cp_media_preview cp_media_preview_icon${
                    (logoIconPublicId ||
                      iconPreviewSrc ||
                      (editLogoIcon && iconDraft && !iconPendingRemoval)) &&
                    !iconPreviewLoadFailed &&
                    !mediaBrandingLoading
                      ? " cp_media_preview_has_image"
                      : ""
                  }`}
                  role={mediaBrandingLoading ? "status" : undefined}
                  aria-live={mediaBrandingLoading ? "polite" : undefined}
                >
                  {mediaBrandingLoading ? (
                    <div
                      className="cp_settings_branding_preview_loading cp_settings_branding_preview_loading_icon"
                      role="status"
                      aria-live="polite"
                    >
                      <Loader2
                        className="cp_settings_branding_preview_spinner"
                        size={24}
                        strokeWidth={1.75}
                        aria-hidden
                      />
                      <span>Loading preview…</span>
                    </div>
                  ) : (logoIconPublicId ||
                    iconPreviewSrc ||
                    (editLogoIcon && iconDraft && !iconPendingRemoval)) &&
                    !iconPreviewLoadFailed ? (
                    <div className="cp_media_icon_preview_wrap">
                      {isBrandingDraftPreview(
                        editLogoIcon,
                        iconPendingRemoval,
                        iconDraft,
                        iconDraftObjectUrl,
                      ) ? (
                        iconDraftObjectUrl ? (
                          <BrandingLocalPreviewImg
                            src={iconDraftObjectUrl}
                            alt="Logo icon preview"
                            className="cp_media_icon_preview"
                          />
                        ) : (
                          <Loader2
                            className="cp_settings_branding_preview_spinner"
                            size={24}
                            strokeWidth={1.75}
                            aria-label="Loading preview"
                          />
                        )
                      ) : (
                        <SettingsBrandedImage
                          publicId={logoIconPublicId}
                          url={logoIconUrl ?? ""}
                          alt="Logo icon preview"
                          className="cp_media_icon_preview"
                          onError={() => setIconPreviewLoadFailed(true)}
                          reactKey={logoIconPublicId ?? iconPreviewSrc ?? "logoIcon"}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="cp_media_icon_preview_wrap">
                      <span className="cp_media_icon_placeholder">
                        <ImageIcon size={28} strokeWidth={1.5} aria-hidden />
                      </span>
                    </div>
                  )}
                </div>
                {editLogoIcon && iconDraft && !readOnly ? (
                  <p className="cp_settings_media_selected_file" title={iconDraft.name}>
                    {iconDraft.name}
                  </p>
                ) : null}
            </div>
            <footer className="cp_settings_media_asset_footer">
              <div className="cp_settings_media_toolbar" aria-label="Logo icon actions">
                <SettingsFieldEditActions
                readOnly={readOnly}
                editing={editLogoIcon}
                editAriaLabel="Edit logo icon"
                onEdit={() => {
                  exitOtherMediaEdits("icon");
                  setIconPendingRemoval(false);
                  setIconDraft(null);
                  setIconPreviewLoadFailed(false);
                  setEditLogoIcon(true);
                }}
                onSave={async () => {
                  if (readOnly || !workspaceCompanyId) {
                    toast.error("Error", "Company workspace is not available.");
                    return;
                  }
                  let nextIcon: string | null = logoIconUrl;
                  if (iconPendingRemoval) {
                    nextIcon = null;
                  } else if (iconDraft) {
                    const up = await postCompanySettingsBranding(
                      workspaceCompanyId,
                      "logoIcon",
                      iconDraft,
                    );
                    if (!up.ok) {
                      toast.error("Upload failed", up.message);
                      return;
                    }
                    brandingUploadEpochRef.current += 1;
                    nextIcon = up.url;
                    if (up.publicId) setLogoIconPublicId(up.publicId);
                    else setLogoIconPublicId(null);
                  }
                  setLogoIconUrl(nextIcon);
                  setIconDraft(null);
                  setIconPendingRemoval(false);
                  setEditLogoIcon(false);
                  const put = await putWorkspaceTabSettings(workspaceCompanyId, "settings", {
                    qualificationEnabled,
                    offeringsMode,
                    emailVerifyBeforeInvest,
                    primaryMemberInFunnel,
                    distributionTypes,
                    logoIconUrl: nextIcon,
                    logoIconPublicId: nextIcon ? undefined : null,
                  });
                  if (put.ok) {
                    const fresh = await fetchWorkspaceTabSettings(
                      workspaceCompanyId,
                      "settings",
                    );
                    if (fresh.ok) applySettingsMediaFromPayload(fresh.payload);
                    toast.success("Saved", "Logo icon updated.");
                    window.dispatchEvent(new Event("company-branding-updated"));
                  } else {
                    toast.error("Save failed", put.message);
                  }
                }}
                onCancel={() => {
                  setIconDraft(null);
                  setIconPendingRemoval(false);
                  setEditLogoIcon(false);
                }}
              />
                {editLogoIcon && !readOnly ? (
                  <div className="cp_media_actions">
                    <button
                      type="button"
                      className="um_btn_secondary"
                      onClick={() => iconFileInputRef.current?.click()}
                    >
                      <Upload size={16} strokeWidth={2} aria-hidden />
                      Upload new
                    </button>
                    <button
                      type="button"
                      className="um_btn_secondary"
                      disabled={
                        !iconDraft && !logoIconUrl && !iconPendingRemoval
                      }
                      onClick={() => {
                        if (iconDraft) {
                          setIconDraft(null);
                          return;
                        }
                        if (iconPendingRemoval) {
                          setIconPendingRemoval(false);
                          return;
                        }
                        if (logoIconUrl) setIconPendingRemoval(true);
                      }}
                    >
                      <Trash2 size={16} strokeWidth={2} aria-hidden />
                      {iconPendingRemoval && !iconDraft
                        ? "Undo remove"
                        : "Delete"}
                    </button>
                  </div>
                ) : null}
              </div>
            </footer>
          </article>
        </div>
      </section>
      </div>
    </div>
  );
}
