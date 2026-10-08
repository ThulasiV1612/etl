import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  getJobDetails,
  getUploadTypes,
  listDeals,
  listJobs,
  listOrganizations,
  migrateEtl,
  resolveContactReview,
} from '../api/client'
import { UploadAuditLog } from '../components/upload/UploadAuditLog'
import { ContactReviewModal } from '../components/upload/ContactReviewModal'
import { SearchableSelect } from '../components/upload/SearchableSelect'
import { StepHeading } from '../components/upload/UploadFlowSteps'
// import { StepHeading, UploadFlowSteps } from '../components/upload/UploadFlowSteps'
import { Toast, useToast } from '../components/ui/Toast'
import type {
  ContactReviewItem,
  ContactReviewResolveAction,
  DealOption,
  DistributionsMappingResult,
  EntityAction,
  EntityKey,
  JobDetailsResponse,
  OrganizationOption,
  UploadType,
} from '../types'

const DEAL_MODES = [
  {
    key: 'details',
    label: 'Upload Deal Details',
    uploadType: 'DEAL_CREATION',
    description: 'Import deal details from Excel',
    flowSteps: [
      { title: 'Select organization' },
      { title: 'Upload deal details Excel' },
    ],
  },
  {
    key: 'assets',
    label: 'Upload Deal Assets',
    uploadType: 'DEAL_ASSETS',
    description: 'Select a deal and upload Asset_Info Excel',
    flowSteps: [
      { title: 'Select deal' },
      { title: 'Upload Asset_Info Excel' },
    ],
  },
] as const

const INVESTOR_MODES = [
  {
    key: 'profiles',
    label: 'Upload Investor Profile only',
    uploadType: 'INVESTOR_PROFILES',
    description: 'ETL_Investor_Profile_Mapping_Template — Addresses → Beneficiaries → Profiles',
    flowSteps: [
      { title: 'Select organization & deal' },
      { title: 'Upload Profile mapping Excel' },
    ],
  },
  {
    key: 'dealInvestors',
    label: "Upload Deal's Investor only",
    uploadType: 'DEAL_INVESTORS',
    description: 'ETL_Add_Investor_Mapping_Template — Add Investors + Investments',
    flowSteps: [
      { title: 'Select deal' },
      { title: 'Upload Add Investor Excel' },
    ],
  },
] as const

const DISTRIBUTION_MODES = [
  {
    key: 'setup',
    label: 'Upload Distribution Setup',
    uploadType: 'DEAL_DISTRIBUTION_SETUP',
    description: 'Waterfall CONFIG → distribution_setup_json (classes must already exist)',
    flowSteps: [
      { title: 'Select deal (optional)' },
      { title: 'Upload Distribution Setup' },
    ],
  },
  {
    key: 'prior',
    label: 'Upload Prior Distributions',
    uploadType: 'DEAL_PRIOR_DISTRIBUTIONS',
    description: 'Already-paid ledger → priorDistributions (investments must already exist)',
    flowSteps: [
      { title: 'Select deal (optional)' },
      { title: 'Upload Prior Distributions' },
    ],
  },
] as const

const CARD_FLOW_STEPS: Record<string, Array<{ title: string }>> = {
  COMPANY_MEMBERS: [
    { title: 'Select organization' },
    { title: 'Upload Excel' },
  ],
  DEAL: [
    { title: 'Choose details or assets' },
    { title: 'Upload Excel' },
  ],
  CONTACTS: [
    { title: 'Select organization' },
    { title: 'Upload Excel' },
  ],
  INVESTORS: [
    { title: 'Choose profile or deal investors' },
    { title: 'Upload Excel' },
  ],
  MEMBERS: [
    { title: 'Select deal' },
    { title: 'Upload Excel' },
  ],
  CLASSES: [
    { title: 'Select deal' },
    { title: 'Upload Class Mapping Excel' },
  ],
  DISTRIBUTION: [
    { title: 'Choose setup or prior' },
    { title: 'Upload Excel' },
  ],
}

type DealModeKey = (typeof DEAL_MODES)[number]['key']
type InvestorModeKey = (typeof INVESTOR_MODES)[number]['key']
type DistributionModeKey = (typeof DISTRIBUTION_MODES)[number]['key']

const HUB_STEP_ORDER = [
  'DEAL',
  'MEMBERS',
  'COMPANY_MEMBERS',
  'CONTACTS',
  'CLASSES',
  'INVESTORS',
  'DISTRIBUTION',
] as const

function getHubStep(key: string) {
  const index = (HUB_STEP_ORDER as readonly string[]).indexOf(key)
  return index >= 0 ? index + 1 : null
}

function sortByHubStep(actions: EntityAction[]) {
  return [...actions].sort((a, b) => {
    const aStep = a.step ?? getHubStep(a.key) ?? 99
    const bStep = b.step ?? getHubStep(b.key) ?? 99
    return aStep - bStep
  })
}

const FALLBACK_ACTIONS: EntityAction[] = [
  {
    key: 'DEAL',
    label: 'Upload Deal',
    step: 1,
    uploadType: 'DEAL_CREATION',
    description: 'Upload deal details from Excel, or upload deal assets for a selected deal',
    modes: [...DEAL_MODES],
  },
  {
    key: 'MEMBERS',
    label: 'Upload Deal Members',
    step: 2,
    uploadType: 'MEMBERS_UPLOAD',
    description: 'Select a deal name, then upload members into that deal',
  },
  {
    key: 'COMPANY_MEMBERS',
    label: 'Upload Company Members',
    step: 3,
    uploadType: 'USERS_UPLOAD',
    description: 'Add users to an organization as company members',
  },
  {
    key: 'CONTACTS',
    label: 'Upload Contacts',
    step: 4,
    uploadType: 'CONTACT_UPLOAD',
    description: 'Import contacts for an organization',
  },
  {
    key: 'CLASSES',
    label: 'Upload Deal Classes',
    step: 5,
    uploadType: 'DEAL_CLASSES',
    description:
      'Upload Class Mapping — loads classes to DB and generates Distribution Setup Excel',
  },
  {
    key: 'INVESTORS',
    label: 'Upload Investors',
    step: 6,
    uploadType: 'INVESTOR_PROFILES',
    description: 'Upload investor profiles or deal investors from ETL mapping templates',
    modes: [...INVESTOR_MODES],
  },
  {
    key: 'DISTRIBUTION',
    label: 'Upload Distributions',
    step: 7,
    uploadType: 'DEAL_DISTRIBUTION_SETUP',
    description: 'Upload waterfall Distribution Setup or Prior (already-paid) Distributions',
    modes: [...DISTRIBUTION_MODES],
  },
]

function mergeEntityActions(apiActions: EntityAction[] = []) {
  const merged = new Map(FALLBACK_ACTIONS.map((action) => [action.key, action]))
  for (const action of apiActions) {
    const fallback = merged.get(action.key)
    const fallbackModes = fallback?.modes || []
    const apiModes = action.modes?.length ? action.modes : fallbackModes
    const fallbackModeMap = new Map(fallbackModes.map((mode) => [mode.key, mode]))
    merged.set(action.key, {
      ...fallback,
      ...action,
      step: fallback?.step ?? action.step ?? getHubStep(action.key) ?? undefined,
      modes: apiModes.map((mode) => ({
        ...fallbackModeMap.get(mode.key),
        ...mode,
        flowSteps: mode.flowSteps?.length
          ? mode.flowSteps
          : fallbackModeMap.get(mode.key)?.flowSteps,
      })),
    })
  }
  return sortByHubStep(Array.from(merged.values()))
}

export function EtlUploadPage() {
  const [uploadTypes, setUploadTypes] = useState<UploadType[]>([])
  const [entityActions, setEntityActions] = useState<EntityAction[]>(FALLBACK_ACTIONS)
  const [selectedEntity, setSelectedEntity] = useState<EntityKey>('DEAL')
  const [dealMode, setDealMode] = useState<DealModeKey>('details')
  const [investorMode, setInvestorMode] = useState<InvestorModeKey>('profiles')
  const [distributionMode, setDistributionMode] = useState<DistributionModeKey>('setup')
  const [organizationId, setOrganizationId] = useState('')
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([])
  const [isOrganizationsLoading, setIsOrganizationsLoading] = useState(false)
  const [dealId, setDealId] = useState('')
  const [deals, setDeals] = useState<DealOption[]>([])
  const [isDealsLoading, setIsDealsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isAuditLoading, setIsAuditLoading] = useState(false)
  const [auditLog, setAuditLog] = useState<JobDetailsResponse | null>(null)
  const [contactReviews, setContactReviews] = useState<ContactReviewItem[]>([])
  const [isResolvingContactReview, setIsResolvingContactReview] = useState(false)
  const [distributionBundle, setDistributionBundle] = useState<DistributionsMappingResult | null>(null)
  const [distributionMapError, setDistributionMapError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast, showToast, hideToast } = useToast()

  const activeAction = entityActions.find((action) => action.key === selectedEntity) || entityActions[0]
  const isDealEntity = selectedEntity === 'DEAL'
  const isInvestorEntity = selectedEntity === 'INVESTORS'
  const activeDealMode = DEAL_MODES.find((mode) => mode.key === dealMode) || DEAL_MODES[0]
  const activeInvestorMode =
    INVESTOR_MODES.find((mode) => mode.key === investorMode) || INVESTOR_MODES[0]
  const activeDistributionMode =
    DISTRIBUTION_MODES.find((mode) => mode.key === distributionMode) || DISTRIBUTION_MODES[0]
  const isDistributionEntity = selectedEntity === 'DISTRIBUTION'
  const uploadType = isDealEntity
    ? activeDealMode.uploadType
    : isInvestorEntity
      ? activeInvestorMode.uploadType
      : isDistributionEntity
        ? activeDistributionMode.uploadType
        : (activeAction?.uploadType || 'DEAL_CREATION')
  const selectedType = uploadTypes.find((type) => type.key === uploadType)
  const isAssetsMode = isDealEntity && dealMode === 'assets'
  const isClassesMode = selectedEntity === 'CLASSES'
  const isDistributionMode = isDistributionEntity
  const isDistributionSetupMode = isDistributionEntity && distributionMode === 'setup'
  const isPriorDistributionsMode = isDistributionEntity && distributionMode === 'prior'
  const isInvestorProfilesMode = isInvestorEntity && investorMode === 'profiles'
  const isDealInvestorsMode = isInvestorEntity && investorMode === 'dealInvestors'
  const needsOrganizationId = Boolean(
    selectedType?.requiresOrganizationId ??
    (
      uploadType === 'DEAL_CREATION' ||
      uploadType === 'USERS_UPLOAD' ||
      uploadType === 'CONTACT_UPLOAD' ||
      uploadType === 'INVESTOR_PROFILES'
    )
  )
  const needsDealId = Boolean(
    isAssetsMode ||
    isClassesMode ||
    isInvestorEntity ||
    selectedType?.requiresDealId ||
    uploadType === 'MEMBERS_UPLOAD' ||
    uploadType === 'DEAL_ASSETS' ||
    uploadType === 'DEAL_CLASSES' ||
    uploadType === 'DEAL_INVESTORS' ||
    uploadType === 'INVESTOR_PROFILES'
  )
  const showOptionalDealFilter = isDistributionMode

  const modeOptions = (
    isDealEntity
      ? (activeAction?.modes?.length ? activeAction.modes : DEAL_MODES)
      : isInvestorEntity
        ? (activeAction?.modes?.length ? activeAction.modes : INVESTOR_MODES)
        : isDistributionEntity
          ? (activeAction?.modes?.length ? activeAction.modes : DISTRIBUTION_MODES)
          : []
  ) as Array<{
    key: string
    label: string
    uploadType: string
    description?: string
    flowSteps?: ReadonlyArray<{ title: string }>
  }>

  const activeModeKey = isDealEntity
    ? dealMode
    : isInvestorEntity
      ? investorMode
      : distributionMode

  async function loadLatestAudit(type: string) {
    setIsAuditLoading(true)
    try {
      const { jobs } = await listJobs(30)
      const latestJob = jobs.find((job) => job.job_type === type)
      if (!latestJob) {
        setAuditLog(null)
        return
      }
      const details = await getJobDetails(latestJob.job_id)
      setAuditLog(details)
    } catch {
      setAuditLog(null)
    } finally {
      setIsAuditLoading(false)
    }
  }

  async function loadOrganizations() {
    setIsOrganizationsLoading(true)
    try {
      const data = await listOrganizations()
      setOrganizations(data.organizations || [])
    } catch (error) {
      setOrganizations([])
      showToast(error instanceof Error ? error.message : 'Failed to load organizations', 'error')
    } finally {
      setIsOrganizationsLoading(false)
    }
  }

  async function loadDeals() {
    setIsDealsLoading(true)
    try {
      const data = await listDeals()
      const nextDeals = (data.deals || []).map((deal) => ({
        ...deal,
        dealName:
          String(deal.dealName || (deal as { deal_name?: string }).deal_name || '').trim() ||
          'Unnamed deal',
      }))
      setDeals(nextDeals)
    } catch (error) {
      setDeals([])
      showToast(error instanceof Error ? error.message : 'Failed to load deals', 'error')
    } finally {
      setIsDealsLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    getUploadTypes()
      .then((data) => {
        if (cancelled) return
        setUploadTypes(data.uploadTypes)
        setEntityActions(mergeEntityActions(data.entityActions))
      })
      .catch((error) => {
        if (!cancelled) showToast(error.message, 'error')
      })

    return () => {
      cancelled = true
    }
  }, [showToast])

  useEffect(() => {
    loadLatestAudit(uploadType)
  }, [uploadType])

  useEffect(() => {
    if (!needsOrganizationId) return
    loadOrganizations()
  }, [needsOrganizationId, uploadType])

  useEffect(() => {
    if (!needsDealId && !showOptionalDealFilter) return
    loadDeals()
  }, [needsDealId, showOptionalDealFilter, uploadType])

  function selectEntity(entityKey: EntityKey) {
    setSelectedEntity(entityKey)
    setAuditLog(null)
    setDealId('')
    if (entityKey === 'DEAL') setDealMode('details')
    if (entityKey === 'INVESTORS') setInvestorMode('profiles')
  }

  function validateOrganizationId() {
    if (!needsOrganizationId) return true

    if (!organizationId.trim()) {
      showToast('Select an organization before uploading', 'error')
      return false
    }

    return true
  }

  function validateDealId() {
    if (!needsDealId) return true

    if (!dealId.trim()) {
      showToast('Select a deal before uploading', 'error')
      return false
    }

    return true
  }

  function handleUploadClick() {
    if (!validateOrganizationId()) return
    if (!validateDealId()) return
    fileInputRef.current?.click()
  }

  async function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) return
    if (!validateOrganizationId()) return
    if (!validateDealId()) return

    setIsUploading(true)
    setDistributionBundle(null)
    setDistributionMapError(null)
    setContactReviews([])

    try {
      const result = await migrateEtl(file, uploadType, {
        organizationId: needsOrganizationId ? organizationId.trim() : undefined,
        dealId:
          needsDealId || (showOptionalDealFilter && dealId.trim())
            ? dealId.trim() || undefined
            : undefined,
      })

      const details = await getJobDetails(result.jobId)
      setAuditLog(details)

      const mapping = result.distributionMapping
      if (mapping && 'downloads' in mapping && mapping.success !== false && mapping.downloads) {
        setDistributionBundle(mapping as DistributionsMappingResult)
      } else if (mapping && 'error' in mapping && mapping.error) {
        setDistributionMapError(mapping.error)
      }

      const pendingReviews = Array.isArray(result.contactReviews)
        ? result.contactReviews
        : []
      if (pendingReviews.length) setContactReviews(pendingReviews)

      if (result.failedCount === 0) {
        let successMessage = `Upload complete — ${result.successCount} row(s) exported`
        if (isAssetsMode) successMessage = 'Deal assets uploaded for the selected deal'
        else if (isClassesMode) {
          successMessage =
            mapping && 'downloads' in mapping && mapping.downloads
              ? 'Deal classes loaded — Distribution Setup Excel ready'
              : `Deal classes loaded — ${result.successCount} class row(s)`
        } else if (isDistributionSetupMode) {
          successMessage = `Distribution setup saved — ${result.successCount} deal(s)`
        } else if (isPriorDistributionsMode) {
          successMessage = `Prior distributions saved — ${result.successCount} run(s)`
        } else if (isInvestorProfilesMode) {
          successMessage = `Investor profiles loaded — ${result.successCount} row(s)`
        }         else if (isDealInvestorsMode) {
          successMessage = pendingReviews.length
            ? `Deal investors loaded — ${result.successCount} row(s). Review ${pendingReviews.length} CRM contact(s).`
            : `Deal investors loaded — ${result.successCount} row(s)`
        } else if (uploadType === 'MEMBERS_UPLOAD') {
          successMessage = pendingReviews.length
            ? `Matched ${result.successCount} member email(s). Confirm ${pendingReviews.length} contact(s) to add as deal members.`
            : `Deal members upload finished — ${result.successCount} row(s)`
        }
        showToast(successMessage, 'success')
      } else {
        showToast(
          `Upload finished — ${result.successCount} exported, ${result.failedCount} not exported`,
          'error'
        )
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Upload failed', 'error')
    } finally {
      setIsUploading(false)
    }
  }

  async function handleResolveContactReview(params: {
    reviewId: string
    action: ContactReviewResolveAction
    selectedContactId?: string | null
  }) {
    setIsResolvingContactReview(true)
    try {
      const currentReview = contactReviews.find(
        (item) => item.reviewId === params.reviewId
      )
      await resolveContactReview({
        reviewId: params.reviewId,
        action: params.action,
        selectedContactId: params.selectedContactId,
        decidedBy: 'etl-ui',
      })
      setContactReviews((current) =>
        current.filter((item) => item.reviewId !== params.reviewId)
      )
      if (params.action === 'CREATE_NEW_CONTACT')
        showToast(
          currentReview?.uploadedInvestor?.entityType === 'deal_member'
            ? 'Contact + signed-up user created and added as deal member'
            : 'New CRM contact created',
          'success'
        )
      else if (params.action === 'EXISTING_CONTACT')
        showToast(
          currentReview?.uploadedInvestor?.entityType === 'deal_member'
            ? 'Confirmed — user ready (signup complete) and added as deal member'
            : 'Linked existing CRM contact',
          'success'
        )
      else
        showToast(
          currentReview?.uploadedInvestor?.entityType === 'deal_member'
            ? 'Skipped deal member'
            : 'Skipped CRM contact for this investor',
          'success'
        )
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Failed to resolve contact review',
        'error'
      )
      throw error
    } finally {
      setIsResolvingContactReview(false)
    }
  }

  const activeLabel = isDealEntity
    ? activeDealMode.label
    : isInvestorEntity
      ? activeInvestorMode.label
      : isDistributionEntity
        ? activeDistributionMode.label
        : activeAction?.label

  const activeFlowSteps = (
    isDealEntity
      ? activeDealMode.flowSteps
      : isInvestorEntity
        ? activeInvestorMode.flowSteps
        : isDistributionEntity
          ? activeDistributionMode.flowSteps
          : CARD_FLOW_STEPS[selectedEntity]
  ) || CARD_FLOW_STEPS[selectedEntity] || [
    { title: needsOrganizationId || needsDealId ? 'Select organization / deal' : 'Review target' },
    { title: 'Upload Excel' },
  ]
  const step1Title = activeFlowSteps[0]?.title || 'Select organization / deal'
  const step2Title = activeFlowSteps[1]?.title || 'Upload Excel'

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Syndication Uploads</p>
          <h1>Upload Hub</h1>
        </div>
      </header>

      {/* <section className="card upload-flow-banner">
        <UploadFlowSteps
          steps={entityActions.map((action) => ({ title: action.label }))}
        />
      </section> */}

      <section className="entity-action-grid">
        {entityActions.map((action) => {
          const step = action.step ?? getHubStep(action.key)
          return (
            <button
              key={action.key}
              type="button"
              className={`entity-action-card${selectedEntity === action.key ? ' active' : ''}`}
              onClick={() => selectEntity(action.key as EntityKey)}
            >
              <span className="entity-action-card-head">
                {step ? (
                  <span className="page-info-step-num" aria-hidden="true">
                    {step}
                  </span>
                ) : null}
                <span className="entity-action-label">
                  {step ? `${action.label} - Step ${step}` : action.label}
                </span>
              </span>
              <span className="entity-action-desc">{action.description}</span>
            </button>
          )
        })}
      </section>

      {modeOptions.length ? (
        <section className="deal-mode-actions" aria-label="Upload mode">
          <p className="deal-mode-heading">
            {isInvestorEntity
              ? 'Choose investor upload type'
              : isDistributionEntity
                ? 'Choose distribution upload type'
                : 'Choose deal upload type'}
          </p>
          <div className="deal-mode-actions-grid">
            {modeOptions.map((mode, index) => (
              <button
                key={mode.key}
                type="button"
                className={`deal-mode-btn${activeModeKey === mode.key ? ' active' : ''}`}
                onClick={() => {
                  if (isDealEntity) setDealMode(mode.key as DealModeKey)
                  if (isInvestorEntity) setInvestorMode(mode.key as InvestorModeKey)
                  if (isDistributionEntity) {
                    setDistributionMode(mode.key as DistributionModeKey)
                  }
                  setDealId('')
                  setAuditLog(null)
                }}
              >
                <span className="entity-action-card-head">
                  <span className="page-info-step-num" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span className="deal-mode-label">
                    {mode.label} - Step {index + 1}
                  </span>
                </span>
                <span className="deal-mode-desc">{mode.description || ''}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="card upload-toolbar-card">
        <div className="upload-toolbar">
          <div className="upload-toolbar-left upload-step-panel">
            <StepHeading step={1}>{step1Title}</StepHeading>
            {needsOrganizationId && !isAssetsMode ? (
              <div className="form-group upload-toolbar-field upload-deal-select">
                <label htmlFor="organizationId">
                  Organization <span className="required">*</span>
                </label>
                <SearchableSelect
                  id="organizationId"
                  options={organizations.map((org) => ({
                    id: org.id,
                    label: org.status ? `${org.name} (${org.status})` : org.name,
                    searchText: org.name,
                  }))}
                  value={organizationId}
                  onChange={setOrganizationId}
                  disabled={isUploading}
                  isLoading={isOrganizationsLoading}
                  placeholder="Select an organization"
                  emptyLabel="No organizations found"
                  searchPlaceholder="Search organization..."
                />
              </div>
            ) : null}

            {needsDealId || showOptionalDealFilter ? (
              <div className="form-group upload-toolbar-field upload-deal-select">
                <label htmlFor="dealId">
                  Deal Name{needsDealId ? <span className="required"> *</span> : ' (optional filter)'}
                </label>
                <SearchableSelect
                  id="dealId"
                  options={deals.map((deal) => ({
                    id: deal.id,
                    label: deal.dealStage
                      ? `${deal.dealName} (${deal.dealStage})`
                      : deal.dealName,
                    searchText: deal.dealName,
                  }))}
                  value={dealId}
                  onChange={setDealId}
                  disabled={isUploading}
                  isLoading={isDealsLoading}
                  placeholder={
                    showOptionalDealFilter && !needsDealId
                      ? 'All deals in file (or pick one)'
                      : 'Select a deal name'
                  }
                  emptyLabel="No deals found — upload a deal first"
                  searchPlaceholder="Search deal name..."
                />
              </div>
            ) : null}

            {!needsOrganizationId && !needsDealId ? (
              <div className="upload-toolbar-meta">
                <span className="upload-toolbar-meta-label">Target</span>
                <span className="upload-toolbar-meta-value">
                  {selectedType?.targetTable || '—'}
                </span>
              </div>
            ) : null}
          </div>

          <div className="upload-toolbar-right upload-step-panel">
            <StepHeading step={2}>{step2Title}</StepHeading>
            <input
              ref={fileInputRef}
              type="file"
              accept={
                isDistributionMode
                  ? '.xlsx,.xls,.csv,.json'
                  : '.xlsx,.xls,.csv'
              }
              className="upload-file-input"
              onChange={handleFileSelected}
            />
            <button
              type="button"
              className="btn btn-primary upload-excel-btn"
              disabled={isUploading}
              onClick={handleUploadClick}
            >
              {isUploading ? <span className="btn-spinner" /> : `Step 2 — ${step2Title}`}
            </button>
          </div>
        </div>

        {isAssetsMode ? (
          <p className="upload-toolbar-hint">
            1) Select Deal Name above → 2) Upload Asset_Info Excel.
            Each row inserts a deal_asset for that deal.
          </p>
        ) : isClassesMode ? (
          <p className="upload-toolbar-hint">
            Upload Class_Mapping_FILLED.xlsx (Classes → Hurdles → Final Tier). Loads classes into
            the database, then auto-generates ETL_Distribution_Setup_FILLED.xlsx for download.
            To save waterfall JSON, use Upload Distribution Setup with that generated file.
          </p>
        ) : isDistributionSetupMode ? (
          <p className="upload-toolbar-hint">
            Upload ETL_Distribution_Setup_FILLED.xlsx or .payload.json (from Distribution Mapping →
            Waterfall Setup). Resolves deal_name and pay_to_class_name → UUIDs, then saves
            distribution_setup_json waterfalls. Does not create classes.
          </p>
        ) : isPriorDistributionsMode ? (
          <p className="upload-toolbar-hint">
            Upload Cash Flow distributions-paid Excel (Distributions by investment), a single-period
            Payment details workbook, or ETL_Distributions_Paid_FILLED.xlsx / .payload.json. Appends
            priorDistributions (periodStart/End, paymentDate, distributionType) without replacing
            waterfall setup. Prefer investments already loaded so payment lines resolve.{' '}
            <Link to="/etl/page-info">Page Info</Link>
          </p>
        ) : isInvestorProfilesMode ? (
          <p className="upload-toolbar-hint">
            Select Organization + Deal Name, then upload ETL_Investor_Profile_Mapping_Template.xlsx
            (Addresses → Beneficiaries → Profiles). Profile is linked to the selected deal in form_snapshot.
          </p>
        ) : isDealInvestorsMode ? (
          <p className="upload-toolbar-hint">
            Select Deal Name, then upload ETL_Add_Investor_Mapping_Template.xlsx —
            Add Investors then Investments. Requires classes; contacts/profiles preferably already loaded.
            <code>selected_sponsors</code> emails must already exist in <code>users</code>
            (company members or deal_participant from Deal Members) — that user’s id is stored as{' '}
            <code>deal_lp_investor.added_by</code>.
            Wire on Investments = funding (wire_transfer), not profile distribution.
          </p>
        ) : uploadType === 'MEMBERS_UPLOAD' ? (
          <p className="upload-toolbar-hint">
            Select Deal Name, then upload Excel with Email + Deal Member Role
            (optional: Deal Member Name, Deal Member Sponsor Name, Deal Member Sponsor Type,
            First/Last Name, Phone).
            Emails are matched to the CRM contact table for the deal’s organization.
            Confirm each match to add them as deal members and auto-create a signed-up
            users row with role <code>deal_participant</code>. Deal title (Lead Sponsor, etc.)
            stays on <code>deal_member.deal_member_role</code>.
          </p>
        ) : selectedType ? (
          <p className="upload-toolbar-hint">
            Excel columns: {selectedType.templateColumns.join(', ')}
          </p>
        ) : null}
      </section>

      {isClassesMode && distributionBundle?.downloads ? (
        <section className="cashflow-downloads" style={{ marginTop: '1rem' }}>
          <h3>Generated Distribution Setup</h3>
          <p className="upload-toolbar-hint" style={{ marginBottom: '0.75rem' }}>
            {distributionBundle.summary?.dealName || 'Deal'} — operating{' '}
            {distributionBundle.summary?.operatingRows ?? 0}, capital{' '}
            {distributionBundle.summary?.capitalRows ?? 0}. Download, then use Upload Distribution
            Setup to load into the database.
          </p>
          <div className="cashflow-download-list">
            <div className="cashflow-download-item">
              <span>ETL_Distribution_Setup_FILLED.xlsx</span>
              <a className="btn btn-secondary btn-sm" href={distributionBundle.downloads.workbook} download>
                Download
              </a>
            </div>
            <div className="cashflow-download-item">
              <span>ETL_Distribution_Setup_FILLED.payload.json</span>
              <a className="btn btn-secondary btn-sm" href={distributionBundle.downloads.payload} download>
                Download
              </a>
            </div>
            {distributionBundle.downloads.warnings ? (
              <div className="cashflow-download-item">
                <span>warnings.txt</span>
                <a
                  className="btn btn-secondary btn-sm"
                  href={distributionBundle.downloads.warnings}
                  download
                >
                  Download
                </a>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {isClassesMode && distributionMapError ? (
        <p className="upload-toolbar-hint" style={{ color: 'var(--danger, #b42318)' }}>
          Classes loaded, but Distribution Setup mapping failed: {distributionMapError}
        </p>
      ) : null}

      <UploadAuditLog
        jobDetails={auditLog}
        isLoading={isAuditLoading || isUploading}
        uploadLabel={activeLabel}
      />

      {contactReviews.length ? (
        <ContactReviewModal
          reviews={contactReviews}
          isResolving={isResolvingContactReview}
          onResolve={handleResolveContactReview}
          onClose={() => setContactReviews([])}
        />
      ) : null}

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </>
  )
}
