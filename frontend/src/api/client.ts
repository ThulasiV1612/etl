import type {
  CashFlowMappingResult,
  ClassesMappingResult,
  ContactReviewItem,
  ContactReviewResolveAction,
  DistributionsMappingResult,
  PriorDistributionsMappingResult,
  DashboardResponse,
  DealOption,
  EntityAction,
  EtlJobResult,
  EtlValidationResult,
  JobDetailsResponse,
  MediaUploadResult,
  OrganizationOption,
  UploadType,
} from '../types'

async function parseJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || ''
  const raw = await response.text()

  if (!raw.trim()) {
    throw new Error(
      response.ok
        ? 'Server returned an empty response'
        : `Request failed (${response.status}). Restart the backend so new API routes are loaded.`
    )
  }

  let data: any
  try {
    data = JSON.parse(raw)
  } catch {
    const preview = raw.slice(0, 80).replace(/\s+/g, ' ')
    throw new Error(
      response.status === 404
        ? 'API route not found. Restart the backend (cd backend && npm run dev).'
        : `Server returned non-JSON (${response.status}${contentType ? `, ${contentType}` : ''}): ${preview}`
    )
  }

  if (!response.ok) {
    const details = [
      data.error || data.reason || data.message || 'Request failed',
      data.received ? `received=${data.received}` : '',
      Array.isArray(data.validUploadTypes) ? `valid=${data.validUploadTypes.join(', ')}` : '',
    ].filter(Boolean)
    throw new Error(details.join(' | '))
  }
  return data as T
}

async function fetchApi(input: RequestInfo, init?: RequestInit) {
  try {
    return await fetch(input, init)
  } catch {
    throw new Error('Backend API is not running. Start it with: cd backend && npm run dev')
  }
}

export async function processCashFlowMapping(
  cashFlowFile: File,
  membersFile: File
): Promise<CashFlowMappingResult> {
  const formData = new FormData()
  formData.append('file', cashFlowFile)
  formData.append('membersFile', membersFile)

  const response = await fetchApi('/api/etl/cash-flow/process', {
    method: 'POST',
    body: formData,
  })

  return parseJson(response)
}

export async function processClassesMapping(
  file: File,
  options?: { dealName?: string }
): Promise<ClassesMappingResult> {
  const formData = new FormData()
  formData.append('file', file)
  if (options?.dealName) formData.append('dealName', options.dealName)

  const response = await fetchApi('/api/etl/classes/process', {
    method: 'POST',
    body: formData,
  })

  return parseJson(response)
}

export async function processDistributionsMapping(
  file: File,
  options?: { dealId?: string }
): Promise<DistributionsMappingResult> {
  const formData = new FormData()
  formData.append('file', file)
  if (options?.dealId) formData.append('dealId', options.dealId)

  const response = await fetchApi('/api/etl/distributions/process', {
    method: 'POST',
    body: formData,
  })

  return parseJson(response)
}

export async function processPriorDistributionsMapping(
  file: File | File[],
  options?: { dealId?: string }
): Promise<PriorDistributionsMappingResult> {
  const formData = new FormData()
  const files = Array.isArray(file) ? file : [file]
  if (files.length === 1) formData.append('file', files[0])
  else files.forEach((f) => formData.append('files', f))
  if (options?.dealId) formData.append('dealId', options.dealId)

  const response = await fetchApi('/api/etl/distributions/prior/process', {
    method: 'POST',
    body: formData,
  })

  return parseJson(response)
}

export async function getUploadTypes(): Promise<{ uploadTypes: UploadType[]; entityActions: EntityAction[] }> {
  const response = await fetchApi('/api/etl/upload-types')
  return parseJson(response)
}

export async function listDeals(): Promise<{ deals: DealOption[] }> {
  const response = await fetchApi('/api/deals')
  return parseJson(response)
}

export async function listOrganizations(): Promise<{ organizations: OrganizationOption[] }> {
  const response = await fetchApi('/api/organizations')
  return parseJson(response)
}

export async function validateEtl(
  file: File,
  uploadType: string,
  options?: { organizationId?: string; dealId?: string }
): Promise<EtlValidationResult> {
  const formData = new FormData()
  formData.append('uploadType', uploadType)
  if (options?.organizationId) {
    formData.append('organization_id', options.organizationId)
    formData.append('organizationId', options.organizationId)
  }
  if (options?.dealId) {
    formData.append('deal_id', options.dealId)
    formData.append('dealId', options.dealId)
  }
  formData.append('file', file)

  const response = await fetchApi('/api/etl/validate', {
    method: 'POST',
    body: formData,
  })

  return parseJson(response)
}

export async function migrateEtl(
  file: File,
  uploadType: string,
  options?: { organizationId?: string; dealId?: string }
): Promise<EtlJobResult> {
  if (!uploadType) {
    throw new Error('Upload type is missing. Select Upload Contacts and try again.')
  }

  const formData = new FormData()
  formData.append('uploadType', uploadType)
  if (options?.organizationId) {
    formData.append('organization_id', options.organizationId)
    formData.append('organizationId', options.organizationId)
  }
  if (options?.dealId) {
    formData.append('deal_id', options.dealId)
    formData.append('dealId', options.dealId)
  }
  formData.append('file', file)

  const response = await fetchApi('/api/etl/migrate', {
    method: 'POST',
    body: formData,
  })

  return parseJson(response)
}

export async function listContactReviews(options?: {
  jobId?: number
  organizationId?: string
}): Promise<{ success: boolean; count: number; reviews: ContactReviewItem[] }> {
  const params = new URLSearchParams()
  if (options?.jobId) params.set('jobId', String(options.jobId))
  if (options?.organizationId) params.set('organizationId', options.organizationId)
  const query = params.toString()
  const response = await fetchApi(
    `/api/etl/contact-reviews${query ? `?${query}` : ''}`
  )
  return parseJson(response)
}

export async function resolveContactReview(params: {
  reviewId: string
  action: ContactReviewResolveAction
  selectedContactId?: string | null
  decidedBy?: string
}): Promise<{
  success: boolean
  reviewId: string
  action: string
  contactId: string | null
  alreadyResolved?: boolean
}> {
  const response = await fetchApi(`/api/etl/contact-reviews/${params.reviewId}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: params.action,
      selectedContactId: params.selectedContactId || null,
      decidedBy: params.decidedBy || 'etl-ui',
    }),
  })
  return parseJson(response)
}

export async function uploadMediaFiles(params: {
  files: File[]
  mediaType: 'document' | 'image'
  entityType: string
  dealId?: string
  organizationId?: string
  documentSection?: string
}): Promise<MediaUploadResult> {
  const formData = new FormData()
  formData.append('mediaType', params.mediaType)
  formData.append('entityType', params.entityType)
  if (params.dealId) formData.append('dealId', params.dealId)
  if (params.organizationId) formData.append('organizationId', params.organizationId)
  if (params.documentSection) formData.append('documentSection', params.documentSection)

  params.files.forEach((file) => formData.append('files', file))

  const response = await fetchApi('/api/media/upload', {
    method: 'POST',
    body: formData,
  })

  return parseJson(response)
}

export async function getDashboard(): Promise<DashboardResponse> {
  const response = await fetchApi('/api/etl/dashboard')
  return parseJson(response)
}

export async function getJobDetails(jobId: number): Promise<JobDetailsResponse> {
  const response = await fetchApi(`/api/etl/jobs/${jobId}`)
  return parseJson(response)
}

export async function listJobs(limit = 50): Promise<{ jobs: JobDetailsResponse['job'][] }> {
  const response = await fetchApi(`/api/etl/jobs?limit=${limit}`)
  return parseJson(response)
}

export async function retryFailedJob(jobId: number): Promise<EtlJobResult> {
  const response = await fetchApi(`/api/etl/jobs/${jobId}/retry`, {
    method: 'POST',
  })
  return parseJson(response)
}

export function getErrorReportUrl(jobId: number): string {
  return `/api/etl/jobs/${jobId}/errors/download`
}

export async function checkHealth(): Promise<{ status: string }> {
  const response = await fetchApi('/api/health')
  return parseJson(response)
}
