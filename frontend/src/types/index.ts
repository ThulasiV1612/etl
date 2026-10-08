export interface EtlError {
  rowNumber?: number
  columnName?: string
  errorType?: string
  errorMessage: string
  dealId?: string
  reason?: string
}

export interface EtlJobResult {
  jobId: number
  uploadType: string
  fileName: string
  status: string
  totalRecords: number
  successCount: number
  failedCount: number
  errors: EtlError[]
  contactReviews?: ContactReviewItem[]
  contactReviewCount?: number
  distributionMapping?: DistributionsMappingResult | {
    success: false
    error: string
  } | null
}

export type ContactReviewResolveAction =
  | 'EXISTING_CONTACT'
  | 'CREATE_NEW_CONTACT'
  | 'SKIP_CONTACT'

export interface ContactReviewCandidate {
  id: string
  firstName?: string
  lastName?: string
  fullName?: string
  email?: string
  phone?: string
  company?: string
  address?: string
  note?: string
  matchScore?: number
  matchPercent?: number
  reasons?: string[]
}

export interface ContactReviewUploadedInvestor {
  email?: string
  firstName?: string
  lastName?: string
  fullName?: string
  phone?: string
  company?: string
  address?: string
  investorId?: string
  sourceProfileId?: string
  dealId?: string
  dealName?: string
  organizationId?: string
  userId?: string
  entityType?: 'deal_member' | string
  dealMemberRole?: string
  role?: string
  sendInvitationMail?: string
}

export interface ContactReviewItem {
  reviewId: string
  jobId?: number | null
  dealId?: string | null
  organizationId?: string | null
  userId?: string | null
  investorKey?: string
  uploadedInvestor: ContactReviewUploadedInvestor
  possibleContacts: ContactReviewCandidate[]
  status?: string
  reasons?: string[]
  createdAt?: string
}

export interface EtlValidationResult {
  uploadType: string
  fileName: string
  valid: boolean
  structureValid?: boolean
  missingColumns: string[]
  headers: string[]
  rowCount: number
  requiredColumns: string[]
  preview: {
    checkedRows: number
    success: number
    failed: number
    errors: EtlError[]
  }
}

export interface UploadType {
  key: string
  label: string
  description: string
  targetTable: string
  templateColumns: string[]
  disabled?: boolean
  entity?: string | null
  mediaOnly?: boolean
  dualFile?: boolean
  requiresOrganizationId?: boolean
  organizationContextFields?: string[]
  requiresDealId?: boolean
  dealContextFields?: string[]
}

export interface DealOption {
  id: string
  dealName: string
  dealStage?: string
  organizationId?: string | null
  createdAt?: string
}

export interface OrganizationOption {
  id: string
  name: string
  status?: string | null
  createdAt?: string
}

export interface EntityActionMode {
  key: string
  label: string
  uploadType: string
  description: string
  flowSteps?: ReadonlyArray<{ title: string }>
}

export interface EntityAction {
  key: string
  label: string
  uploadType: string
  description: string
  step?: number
  modes?: EntityActionMode[]
}

export interface MediaUploadResult {
  success: boolean
  mediaType: string
  entityType: string
  documentSection?: string | null
  count: number
  files: Array<{
    mediaId: number
    originalName: string
    fileSize: number
    dealId: string | null
    documentSection?: string | null
    createdAt: string
  }>
}

export interface EtlJob {
  job_id: number
  job_type: string
  file_name: string
  status: string
  start_time: string | null
  end_time: string | null
  total_records: number
  success_count: number
  failed_count: number
  created_by: string
  created_at: string
}

export interface EtlStage {
  stage_log_id: number
  job_id: number
  stage_name: string
  status: string
  start_time: string
  end_time: string | null
  message: string | null
}

export interface DashboardStats {
  total_uploads: number
  successful_jobs: number
  failed_jobs: number
  running_jobs: number
  records_processed: number
  error_count: number
}

export interface DashboardResponse {
  stats: DashboardStats
  recentJobs: EtlJob[]
}

export interface JobDetailsResponse {
  job: EtlJob
  file: {
    file_id: number
    file_name: string
    file_size: number
    upload_time: string
  } | null
  stages: EtlStage[]
  errors: Array<{
    error_id: number
    row_number: number
    column_name: string
    error_type: string
    error_message: string
  }>
  records: Array<{
    row_number: number
    status: string
    entity_id: string | null
    error_message: string | null
    column_name?: string | null
  }>
}

export type UploadMode = 'excel' | 'documents' | 'images'
export type EntityKey =
  | 'DEAL'
  | 'INVESTORS'
  | 'MEMBERS'
  | 'CLASSES'
  | 'DISTRIBUTION'
  | 'COMPANY_MEMBERS'
  | 'CONTACTS'

export interface CashFlowMappingSummary {
  profiles: number
  investments: number
  deals: number
  beneficiaries: number
  warnings: number
}

export interface CashFlowDealFolder {
  dealName: string
  folderName: string
  folderPath?: string
  profiles?: number
  investments?: number
  fileNames?: {
    profile: string
    mapping: string
  }
  downloads: {
    profile: string
    mapping: string
    warnings?: string | null
  }
}

export interface CashFlowMappingResult {
  success: boolean
  jobId?: string
  mapFolder?: string
  summary: CashFlowMappingSummary
  warnings: string[]
  dealFolders?: CashFlowDealFolder[]
  downloads: {
    profile: string
    mapping: string
    warnings?: string | null
  }
  error?: string
}

export interface ClassesMappingSummary {
  dealName: string
  classes: number
  hurdles: number
  finalTiers: number
  targetRaise: string
  warnings: number
}

export interface ClassesMappingResult {
  success: boolean
  jobId?: string
  mapFolder?: string
  summary: ClassesMappingSummary
  warnings: string[]
  dealFolders?: Array<{
    dealName: string
    folderName: string
    folderPath?: string
    downloads: {
      mapping: string
      warnings?: string | null
    }
  }>
  downloads: {
    mapping: string
    warnings?: string | null
  }
  error?: string
}

export interface DistributionsMappingSummary {
  dealName: string
  dealId?: string
  operatingRows: number
  capitalRows: number
  targetRaise: string
  promoteHurdles?: number
  warnings: number
}

export interface PriorDistributionsMappingSummary {
  dealName: string
  dealId?: string
  runCount: number
  totalPaid: number
  lineCount: number
  fileCount?: number
  warnings: number
}

export interface DistributionsMappingResult {
  success: boolean
  mapFolder?: string
  summary: DistributionsMappingSummary
  warnings: string[]
  dealFolders?: Array<{
    dealName: string
    folderName: string
    folderPath?: string
    downloads: {
      workbook: string
      payload: string
      promote?: string | null
      warnings?: string | null
    }
  }>
  downloads: {
    workbook: string
    payload: string
    promote?: string | null
    warnings?: string | null
  }
  error?: string
}

export interface PriorDistributionsMappingResult {
  success: boolean
  mapFolder?: string
  summary: PriorDistributionsMappingSummary
  warnings: string[]
  dealFolders?: Array<{
    dealName: string
    folderName: string
    folderPath?: string
    downloads: {
      workbook: string
      payload: string
      warnings?: string | null
    }
  }>
  downloads: {
    workbook: string
    payload: string
    warnings?: string | null
  }
  error?: string
}
