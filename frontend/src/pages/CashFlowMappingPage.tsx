import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import { processCashFlowMapping } from '../api/client'
import { StepHeading, UploadFlowSteps } from '../components/upload/UploadFlowSteps'
import { Toast, useToast } from '../components/ui/Toast'
import type { CashFlowMappingResult } from '../types'

const PROGRESS_STEPS = [
  'Reading Cash Flow workbook...',
  'Reading Deal Members sheet...',
  'Loading Investors sheet...',
  'Reading Questionnaire sheet...',
  'Mapping sponsor names to emails...',
  'Creating Investor Mapping...',
  'Generating Excel files...',
  'Finalizing...',
]

export function CashFlowMappingPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const membersFileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [membersFile, setMembersFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isMembersDragging, setIsMembersDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progressIndex, setProgressIndex] = useState(0)
  const [result, setResult] = useState<CashFlowMappingResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { toast, showToast, hideToast } = useToast()

  useEffect(() => {
    if (!isProcessing) return undefined

    setProgressIndex(0)
    const timer = window.setInterval(() => {
      setProgressIndex((current) =>
        current < PROGRESS_STEPS.length - 1 ? current + 1 : current
      )
    }, 900)

    return () => window.clearInterval(timer)
  }, [isProcessing])

  function acceptFile(next: File | null) {
    setResult(null)
    setError(null)

    if (!next) {
      setFile(null)
      return
    }

    const ext = next.name.split('.').pop()?.toLowerCase()
    if (ext !== 'xlsx') {
      setFile(null)
      setError('Please upload an Excel (.xlsx) file.')
      showToast('Please upload an Excel (.xlsx) file.', 'error')
      return
    }

    setFile(next)
  }

  function onBrowseChange(event: ChangeEvent<HTMLInputElement>) {
    acceptFile(event.target.files?.[0] || null)
    event.target.value = ''
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(false)
    if (isProcessing) return
    acceptFile(event.dataTransfer.files?.[0] || null)
  }

  function acceptMembersFile(next: File | null) {
    setResult(null)
    setError(null)

    if (!next) {
      setMembersFile(null)
      return
    }

    const ext = next.name.split('.').pop()?.toLowerCase()
    if (ext !== 'xlsx') {
      setMembersFile(null)
      setError('Deal Members file must be an Excel (.xlsx) file.')
      showToast('Deal Members file must be an Excel (.xlsx) file.', 'error')
      return
    }

    setMembersFile(next)
  }

  function onMembersBrowseChange(event: ChangeEvent<HTMLInputElement>) {
    acceptMembersFile(event.target.files?.[0] || null)
    event.target.value = ''
  }

  function onMembersDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsMembersDragging(false)
    if (isProcessing) return
    acceptMembersFile(event.dataTransfer.files?.[0] || null)
  }

  async function onGenerate() {
    if (!file || !membersFile || isProcessing) return

    setIsProcessing(true)
    setError(null)
    setResult(null)

    try {
      const data = await processCashFlowMapping(file, membersFile)
      setResult(data)
      setProgressIndex(PROGRESS_STEPS.length - 1)
      showToast('ETL files generated successfully.', 'success')
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

  const progressPct = Math.round(((progressIndex + 1) / PROGRESS_STEPS.length) * 100)

  return (
    <div className="cashflow-mapping-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">ETL</p>
          <h1>Profile & Investor Mapping</h1>
          <p className="page-description">
            Upload two Excel files: the Cash Flow Portal <strong>Investments</strong> export and a
            <strong> Deal Members</strong> sheet (sponsor name + email). The mapper copies
            <code> Selected sponsors</code> from Cash Flow and resolves sponsor names to emails
            using the Deal Members file, then generates
            <strong> Add_Profile_FILLED.xlsx</strong> and
            <strong> Add_Investor_Mapping_FILLED.xlsx</strong> for ETL Upload.
          </p>
        </div>
      </div>

      <section className="card upload-flow-banner">
        <UploadFlowSteps
          steps={[
            { title: 'Upload Cash Flow Investments Excel' },
            { title: 'Upload Deal Members Excel' },
          ]}
        />
      </section>

      <div className="cashflow-mapping-grid">
        <section className="card cashflow-mapping-card">
          <StepHeading step={1}>Upload Cash Flow Investments Excel</StepHeading>
          <p className="cashflow-mapping-help">
            Cash Flow export with <strong>Investors (profile)</strong> sheet. Contains investor rows,
            commitment amounts, and <strong>Selected sponsors</strong> (usually sponsor names).
          </p>

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
                {file ? file.name : 'Drag & drop your .xlsx file here'}
              </p>
              <p className="dropzone-hint">
                {file ? 'Click to replace file' : 'or click Browse to select a file'}
              </p>
            </div>
          </div>

          <input
            ref={fileInputRef}
            className="upload-file-input"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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

          {error ? (
            <div className="validation-panel error" style={{ marginTop: '1.25rem' }}>
              <h3>Validation</h3>
              <p>{error}</p>
            </div>
          ) : null}
        </section>

        <section className="card cashflow-mapping-card">
          <StepHeading step={2}>Upload Deal Members Excel</StepHeading>
          <p className="cashflow-mapping-help">
            Use the same Deal Members template as Upload Hub:
            <code> Email | Deal Member Role | Deal Member Name | Deal Member Sponsor Name |
            Deal Member Sponsor Type | First Name | Last Name | Phone | Send Invitation</code>.
            Mapping uses Email + names to resolve Cash Flow <strong>Selected sponsors</strong>
            → emails. Sponsor Type / Phone / Send Invitation are ignored here (used later on Upload Hub).
          </p>

          <div
            className={`file-dropzone${isMembersDragging ? ' dragover' : ''}${isProcessing ? ' disabled' : ''}`}
            onDragOver={(event) => {
              event.preventDefault()
              if (!isProcessing) setIsMembersDragging(true)
            }}
            onDragLeave={() => setIsMembersDragging(false)}
            onDrop={onMembersDrop}
            onClick={() => {
              if (!isProcessing) membersFileInputRef.current?.click()
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                if (!isProcessing) membersFileInputRef.current?.click()
              }
            }}
          >
            <div>
              <p className="dropzone-icon">↑</p>
              <p className="dropzone-title">
                {membersFile ? membersFile.name : 'Drag & drop Deal Members .xlsx here'}
              </p>
              <p className="dropzone-hint">
                {membersFile ? 'Click to replace file' : 'or click Browse to select a file'}
              </p>
            </div>
          </div>

          <input
            ref={membersFileInputRef}
            className="upload-file-input"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={onMembersBrowseChange}
            disabled={isProcessing}
          />

          <div className="cashflow-mapping-actions">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={isProcessing}
              onClick={() => membersFileInputRef.current?.click()}
            >
              Step 2 — Browse Members
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!file || !membersFile || isProcessing}
              onClick={onGenerate}
            >
              {isProcessing ? <span className="btn-spinner" /> : null}
              Generate ETL Files
            </button>
          </div>
        </section>

        {(isProcessing || result) && (
          <section className="card cashflow-mapping-card">
            {isProcessing ? (
              <div className="cashflow-processing">
                <div className="cashflow-processing-header">
                  <span className="btn-spinner cashflow-spinner" />
                  <div>
                    <h2>Processing</h2>
                    <p>{PROGRESS_STEPS[progressIndex]}</p>
                  </div>
                </div>
                <div className="cashflow-progress-track" aria-hidden="true">
                  <div
                    className="cashflow-progress-fill"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <ol className="cashflow-progress-steps">
                  {PROGRESS_STEPS.map((step, index) => (
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
                  Profile + Investor Mapping Excels are ready to download.
                </div>

                <div className="stats-grid cashflow-summary-grid">
                  <div className="stat-card">
                    <div className="stat-value">{result.summary.profiles}</div>
                    <div className="stat-label">Profiles Mapped</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{result.summary.investments}</div>
                    <div className="stat-label">Investments Mapped</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{result.summary.deals}</div>
                    <div className="stat-label">Deals</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{result.summary.beneficiaries}</div>
                    <div className="stat-label">Beneficiaries</div>
                  </div>
                  <div className={`stat-card${result.summary.warnings ? ' warning' : ''}`}>
                    <div className="stat-value">{result.summary.warnings}</div>
                    <div className="stat-label">Warnings</div>
                  </div>
                </div>

                <div className="cashflow-downloads">
                  <h3>3. Download generated Excels</h3>
                  <p className="cashflow-mapping-help">
                    Also saved under <code>python/mapFolder/&lt;Deal Name&gt;/</code>.
                  </p>
                  {(result.dealFolders?.length ? result.dealFolders : [{
                    dealName: 'Mapped Deal',
                    folderName: '',
                    downloads: result.downloads,
                  }]).map((deal) => (
                    <div key={deal.folderName || deal.dealName} className="cashflow-deal-folder">
                      <div className="cashflow-deal-folder-header">
                        <strong>{deal.dealName}</strong>
                        {deal.folderPath ? (
                          <span className="cashflow-deal-folder-path">{deal.folderPath}</span>
                        ) : null}
                      </div>
                      <div className="cashflow-download-list">
                        <div className="cashflow-download-item">
                          <div>
                            <strong>Profiles mapping</strong>
                            <div className="cashflow-mapping-help" style={{ margin: 0 }}>
                              Add_Profile_FILLED.xlsx
                            </div>
                          </div>
                          <a
                            className="btn btn-primary btn-sm"
                            href={deal.downloads.profile}
                            download={deal.fileNames?.profile || `${deal.dealName}_Add_Profile_FILLED.xlsx`}
                          >
                            Download Profiles
                          </a>
                        </div>
                        <div className="cashflow-download-item">
                          <div>
                            <strong>Investor mapping</strong>
                            <div className="cashflow-mapping-help" style={{ margin: 0 }}>
                              Add_Investor_Mapping_FILLED.xlsx
                            </div>
                          </div>
                          <a
                            className="btn btn-primary btn-sm"
                            href={deal.downloads.mapping}
                            download={deal.fileNames?.mapping || `${deal.dealName}_Add_Investor_Mapping_FILLED.xlsx`}
                          >
                            Download Investors
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="validation-panel" style={{ marginTop: '1.25rem' }}>
                  <h3>4. Upload on ETL Upload (in order)</h3>
                  <ol className="info-list">
                    <li>
                      <strong>Upload Deal Members</strong> for the deal (creates{' '}
                      <code>users</code> with role <code>deal_participant</code>)
                    </li>
                    <li>
                      Select the deal → upload <strong>Deal’s Investor</strong> (Investor mapping Excel)
                    </li>
                    <li>Resolve any CRM contact reviews</li>
                    <li>Upload <strong>Profiles</strong> (Profiles mapping Excel)</li>
                    <li>Re-upload <strong>Deal’s Investor</strong> to link profile ids</li>
                  </ol>
                  <p style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                    <Link className="btn btn-secondary btn-sm" to="/etl-upload">
                      Open ETL Upload
                    </Link>
                  </p>
                </div>

                {result.warnings?.length ? (
                  <div className="cashflow-warnings-panel">
                    <div className="cashflow-warnings-header">
                      <h3>Warnings</h3>
                      {result.downloads.warnings ? (
                        <a
                          className="btn-text"
                          href={result.downloads.warnings}
                          download
                        >
                          Download warning log
                        </a>
                      ) : null}
                    </div>
                    <ul className="info-list">
                      {result.warnings.slice(0, 40).map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                    {result.warnings.length > 40 ? (
                      <p className="cashflow-mapping-help" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                        Showing first 40 of {result.warnings.length} warnings. Download the warning log for the full list.
                      </p>
                    ) : null}
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
            <p>{PROGRESS_STEPS[progressIndex]}</p>
          </div>
        </div>
      ) : null}

      {toast ? (
        <Toast message={toast.message} type={toast.type} onClose={hideToast} />
      ) : null}
    </div>
  )
}
