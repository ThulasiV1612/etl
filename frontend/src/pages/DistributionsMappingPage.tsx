import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  listDeals,
  processDistributionsMapping,
  processPriorDistributionsMapping,
} from '../api/client'
import { SearchableSelect } from '../components/upload/SearchableSelect'
import { StepHeading, UploadFlowSteps } from '../components/upload/UploadFlowSteps'
import { Toast, useToast } from '../components/ui/Toast'
import type {
  DealOption,
  DistributionsMappingResult,
  PriorDistributionsMappingResult,
} from '../types'

type MappingMode = 'setup' | 'prior'

const SETUP_PROGRESS = [
  'Reading Class Mapping workbook...',
  'Loading Classes sheet...',
  'Mapping LP preferred returns...',
  'Building operating waterfall...',
  'Building capital waterfall...',
  'Generating Distribution Setup files...',
  'Finalizing...',
]

const PRIOR_PROGRESS = [
  'Reading distributions-paid Excel...',
  'Loading Distributions by investment...',
  'Grouping distribution runs...',
  'Building investor payment lines...',
  'Generating Prior Distributions files...',
  'Finalizing...',
]

export function DistributionsMappingPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Waterfall Setup tab temporarily disabled — default to Prior Distributions
  const [mode, setMode] = useState<MappingMode>('prior')
  const [file, setFile] = useState<File | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [dealId, setDealId] = useState('')
  const [deals, setDeals] = useState<DealOption[]>([])
  const [isDealsLoading, setIsDealsLoading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progressIndex, setProgressIndex] = useState(0)
  const [setupResult, setSetupResult] = useState<DistributionsMappingResult | null>(null)
  const [priorResult, setPriorResult] = useState<PriorDistributionsMappingResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { toast, showToast, hideToast } = useToast()

  const progressSteps = mode === 'setup' ? SETUP_PROGRESS : PRIOR_PROGRESS
  const result = mode === 'setup' ? setupResult : priorResult
  const priorFiles = files.length ? files : file ? [file] : []
  const hasInput = mode === 'setup' ? Boolean(file) : priorFiles.length > 0

  useEffect(() => {
    let cancelled = false

    async function loadDeals() {
      setIsDealsLoading(true)
      try {
        const data = await listDeals()
        if (cancelled) return
        setDeals(
          (data.deals || []).map((deal) => ({
            ...deal,
            dealName:
              String(deal.dealName || (deal as { deal_name?: string }).deal_name || '').trim() ||
              'Unnamed deal',
          }))
        )
      } catch {
        if (!cancelled) setDeals([])
      } finally {
        if (!cancelled) setIsDealsLoading(false)
      }
    }

    loadDeals()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isProcessing) return undefined

    setProgressIndex(0)
    const timer = window.setInterval(() => {
      setProgressIndex((current) =>
        current < progressSteps.length - 1 ? current + 1 : current
      )
    }, 900)

    return () => window.clearInterval(timer)
  }, [isProcessing, progressSteps.length])

  function switchMode(next: MappingMode) {
    if (isProcessing || next === mode) return
    setMode(next)
    setFile(null)
    setFiles([])
    setError(null)
    setSetupResult(null)
    setPriorResult(null)
  }

  function acceptFiles(list: FileList | File[] | null) {
    setSetupResult(null)
    setPriorResult(null)
    setError(null)

    const incoming = Array.from(list || [])
    if (!incoming.length) {
      setFile(null)
      setFiles([])
      return
    }

    const xlsxOnly = incoming.filter((f) => f.name.split('.').pop()?.toLowerCase() === 'xlsx')
    if (!xlsxOnly.length) {
      setFile(null)
      setFiles([])
      setError('Please upload Excel (.xlsx) file(s).')
      showToast('Please upload Excel (.xlsx) file(s).', 'error')
      return
    }

    if (mode === 'setup') {
      setFile(xlsxOnly[0])
      setFiles([])
      return
    }

    setFiles(xlsxOnly)
    setFile(xlsxOnly[0] || null)
  }

  function onBrowseChange(event: ChangeEvent<HTMLInputElement>) {
    acceptFiles(event.target.files)
    event.target.value = ''
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(false)
    if (isProcessing) return
    acceptFiles(event.dataTransfer.files)
  }

  async function onGenerate() {
    if (!hasInput || isProcessing) return

    if (!dealId.trim()) {
      setError('Select a deal before generating files.')
      showToast('Select a deal before generating files.', 'error')
      return
    }

    setIsProcessing(true)
    setError(null)
    setSetupResult(null)
    setPriorResult(null)

    try {
      if (mode === 'setup') {
        if (!file) throw new Error('Please upload Class_Mapping_FILLED.xlsx.')
        const data = await processDistributionsMapping(file, { dealId: dealId.trim() })
        setSetupResult(data)
        showToast('Distribution Setup files generated successfully.', 'success')
      } else {
        const data = await processPriorDistributionsMapping(priorFiles, {
          dealId: dealId.trim(),
        })
        setPriorResult(data)
        showToast(
          `Mapped ${data.summary?.runCount ?? priorFiles.length} distribution(s) successfully.`,
          'success'
        )
      }
      setProgressIndex(progressSteps.length - 1)
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Processing failed. Please review the uploaded file.'
      setError(message)
      showToast(message, 'error')
    } finally {
      setIsProcessing(false)
    }
  }

  const selectedDeal = deals.find((deal) => deal.id === dealId)
  const progressPct = Math.round(((progressIndex + 1) / progressSteps.length) * 100)

  return (
    <div className="cashflow-mapping-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">ETL</p>
          <h1>Distribution Mapping</h1>
          <p className="page-description">
            Generate Prior Distributions (already paid). Prior loads into Deal → Distributions
            table via distribution_setup_json.priorDistributions.{' '}
            <Link to="/etl/page-info" className="page-info-inline-link">
              See Page Info →
            </Link>
          </p>
        </div>
      </div>

      <section className="card upload-flow-banner">
        <UploadFlowSteps
          steps={
            mode === 'setup'
              ? [
                  { title: 'Select deal & upload Class Mapping' },
                  { title: 'Generate Distribution Setup' },
                ]
              : [
                  { title: 'Select deal & upload distribution Excel' },
                  { title: 'Generate Prior Distributions' },
                ]
          }
        />
      </section>

      <div className="cashflow-mapping-grid">
        <section className="card cashflow-mapping-card">
          <div className="mode-toggle" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            {/* Waterfall Setup tab commented out for now
            <button
              type="button"
              className={`btn btn-sm ${mode === 'setup' ? 'btn-primary' : 'btn-secondary'}`}
              disabled={isProcessing}
              onClick={() => switchMode('setup')}
            >
              Waterfall Setup
            </button>
            */}
            <button
              type="button"
              className={`btn btn-sm ${mode === 'prior' ? 'btn-primary' : 'btn-secondary'}`}
              disabled={isProcessing}
              onClick={() => switchMode('prior')}
            >
              Prior Distributions (Paid)
            </button>
          </div>

          <StepHeading step={1}>
            {mode === 'setup'
              ? 'Select Deal & Upload Class Mapping'
              : 'Select Deal & Upload Distribution Excel(s)'}
          </StepHeading>
          <p className="cashflow-mapping-help">
            {mode === 'setup'
              ? 'Choose the deal, then upload Class_Mapping_FILLED.xlsx (Classes / Hurdles / Final Tier).'
              : 'Upload one or many Cash Flow period Excels from the Distributions folder (e.g. “Deal distribution (07-24-2025 - 07-25-2025)_….xlsx”) and/or a distributions-paid workbook. Each period file becomes one Deal → Distributions row; Payment details fill Distribution Details.'}
          </p>

          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label htmlFor="distributionDealId">Deal Name</label>
            <SearchableSelect
              id="distributionDealId"
              options={deals.map((deal) => ({
                id: deal.id,
                label: deal.dealStage
                  ? `${deal.dealName} (${deal.dealStage})`
                  : deal.dealName,
                searchText: `${deal.dealName} ${deal.id}`,
              }))}
              value={dealId}
              disabled={isProcessing || isDealsLoading}
              placeholder={isDealsLoading ? 'Loading deals...' : 'Search and select a deal'}
              onChange={(nextId) => {
                setDealId(nextId)
                setSetupResult(null)
                setPriorResult(null)
                setError(null)
              }}
            />
            {selectedDeal ? (
              <small>
                Deal ID: <code>{selectedDeal.id}</code>
              </small>
            ) : (
              <small>Required — written into the generated files as deal_id.</small>
            )}
          </div>

          <div
            className={`file-dropzone${isDragging ? ' dragover' : ''}${isProcessing ? ' disabled' : ''}`}
            onDragOver={(event) => {
              event.preventDefault()
              if (!isProcessing) setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => {
              if (!isProcessing) fileInputRef.current?.click()
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                if (!isProcessing) fileInputRef.current?.click()
              }
            }}
          >
            <div>
              <p className="dropzone-icon">↑</p>
              <p className="dropzone-title">
                {mode === 'setup'
                  ? file
                    ? file.name
                    : 'Drag & drop Class_Mapping_FILLED.xlsx here'
                  : priorFiles.length
                    ? `${priorFiles.length} file(s) selected`
                    : 'Drag & drop distribution .xlsx file(s) here'}
              </p>
              <p className="dropzone-hint">
                {mode === 'setup'
                  ? file
                    ? 'Click to replace file'
                    : 'or click Browse to select a file'
                  : priorFiles.length
                    ? priorFiles.map((f) => f.name).join(', ')
                    : 'Select multiple period Excels — any count is supported'}
              </p>
            </div>
          </div>

          <input
            ref={fileInputRef}
            className="upload-file-input"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            multiple={mode === 'prior'}
            onChange={onBrowseChange}
            disabled={isProcessing}
          />

          <div className="cashflow-mapping-actions">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={isProcessing}
              onClick={() => fileInputRef.current?.click()}
            >
              Step 1 — Browse Excel
            </button>
          </div>

          <StepHeading step={2}>
            {mode === 'setup' ? 'Generate Distribution Setup' : 'Generate Prior Distributions'}
          </StepHeading>
          <div className="cashflow-mapping-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!hasInput || !dealId || isProcessing}
              onClick={onGenerate}
            >
              {isProcessing ? <span className="btn-spinner" /> : null}
              {mode === 'setup'
                ? 'Step 2 — Generate Distribution Setup'
                : 'Step 2 — Generate Prior Distributions'}
            </button>
          </div>

          {error ? (
            <div className="validation-panel error" style={{ marginTop: '1.25rem' }}>
              <h3>Validation</h3>
              <p>{error}</p>
            </div>
          ) : null}
        </section>

        {(isProcessing || result) && (
          <section className="card cashflow-mapping-card">
            {isProcessing ? (
              <div className="cashflow-processing">
                <div className="cashflow-processing-header">
                  <span className="btn-spinner cashflow-spinner" />
                  <div>
                    <h2>Processing</h2>
                    <p>{progressSteps[progressIndex]}</p>
                  </div>
                </div>
                <div className="cashflow-progress-track" aria-hidden="true">
                  <div
                    className="cashflow-progress-fill"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <ol className="cashflow-progress-steps">
                  {progressSteps.map((step, index) => (
                    <li
                      key={step}
                      className={
                        index < progressIndex
                          ? 'done'
                          : index === progressIndex
                            ? 'active'
                            : ''
                      }
                    >
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            {result && !isProcessing ? (
              <div className="cashflow-results">
                <div className="cashflow-success-banner">
                  {mode === 'setup'
                    ? 'Step 2 complete — Distribution Setup files generated. Download, then Upload Hub → Upload Distribution Setup.'
                : 'Step 2 complete — Prior Distributions files generated. Download, then Upload Hub → Upload Prior Distributions (populates Deal → Distributions table).'}
                </div>

                {'operatingRows' in result.summary ? (
                  <>
                    <p className="cashflow-mapping-help" style={{ marginBottom: '1rem' }}>
                      Deal: <strong>{result.summary.dealName}</strong>
                      {result.summary.dealId ? (
                        <>
                          {' '}
                          · ID: <code>{result.summary.dealId}</code>
                        </>
                      ) : null}
                    </p>
                    <div className="stats-grid cashflow-summary-grid classes-summary-grid">
                      <div className="stat-card">
                        <div className="stat-value">{result.summary.operatingRows}</div>
                        <div className="stat-label">Operating Rows</div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-value">{result.summary.capitalRows}</div>
                        <div className="stat-label">Capital Rows</div>
                      </div>
                      <div className={`stat-card${result.summary.warnings ? ' warning' : ''}`}>
                        <div className="stat-value">{result.summary.warnings}</div>
                        <div className="stat-label">Warnings</div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="cashflow-mapping-help" style={{ marginBottom: '1rem' }}>
                      Deal: <strong>{result.summary.dealName}</strong>
                      {result.summary.dealId ? (
                        <>
                          {' '}
                          · ID: <code>{result.summary.dealId}</code>
                        </>
                      ) : null}
                    </p>
                    <div className="stats-grid cashflow-summary-grid classes-summary-grid">
                      <div className="stat-card">
                        <div className="stat-value">
                          {'fileCount' in result.summary
                            ? result.summary.fileCount ?? priorFiles.length
                            : priorFiles.length}
                        </div>
                        <div className="stat-label">Source files</div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-value">{result.summary.runCount}</div>
                        <div className="stat-label">Distributions</div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-value">{result.summary.lineCount}</div>
                        <div className="stat-label">Payment Lines</div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-value">{result.summary.totalPaid}</div>
                        <div className="stat-label">Total Paid</div>
                      </div>
                    </div>
                  </>
                )}

                <div className="cashflow-downloads">
                  <h3>Step 3 — Download Generated Files</h3>
                  {(result.dealFolders?.length
                    ? result.dealFolders
                    : [{
                        dealName: result.summary.dealName || 'Mapped Deal',
                        folderName: '',
                        folderPath: result.mapFolder,
                        downloads: result.downloads,
                      }]
                  ).map((deal) => (
                    <div key={deal.folderName || deal.dealName} className="cashflow-deal-folder">
                      <div className="cashflow-deal-folder-header">
                        <strong>{deal.dealName}</strong>
                        {deal.folderPath ? (
                          <span className="cashflow-deal-folder-path">{deal.folderPath}</span>
                        ) : null}
                      </div>
                      <div className="cashflow-download-list">
                        <div className="cashflow-download-item">
                          <span>
                            {mode === 'setup'
                              ? 'ETL_Distribution_Setup_FILLED.xlsx'
                              : 'ETL_Distributions_Paid_FILLED.xlsx'}
                          </span>
                          <a
                            className="btn btn-secondary btn-sm"
                            href={deal.downloads.workbook}
                            download
                          >
                            Download
                          </a>
                        </div>
                        <div className="cashflow-download-item">
                          <span>
                            {mode === 'setup'
                              ? 'ETL_Distribution_Setup_FILLED.payload.json'
                              : 'ETL_Distributions_Paid_FILLED.payload.json'}
                          </span>
                          <a
                            className="btn btn-secondary btn-sm"
                            href={deal.downloads.payload}
                            download
                          >
                            Download
                          </a>
                        </div>
                        {mode === 'setup' && deal.downloads.promote ? (
                          <div className="cashflow-download-item">
                            <span>ETL_Class_Promote_FILLED.payload.json</span>
                            <a
                              className="btn btn-secondary btn-sm"
                              href={deal.downloads.promote}
                              download
                            >
                              Download
                            </a>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>

                {result.warnings?.length ? (
                  <div className="cashflow-warnings-panel">
                    <div className="cashflow-warnings-header">
                      <h3>Warnings</h3>
                      {result.downloads.warnings ? (
                        <a className="btn-text" href={result.downloads.warnings} download>
                          Download warning log
                        </a>
                      ) : null}
                    </div>
                    <ul className="info-list">
                      {result.warnings.slice(0, 40).map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        )}
      </div>

      {isProcessing ? (
        <div className="cashflow-loading-overlay" aria-hidden="true">
          <div className="cashflow-loading-card">
            <span className="btn-spinner cashflow-spinner" />
            <p>{progressSteps[progressIndex]}</p>
          </div>
        </div>
      ) : null}

      {toast ? (
        <Toast message={toast.message} type={toast.type} onClose={hideToast} />
      ) : null}
    </div>
  )
}
