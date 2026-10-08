import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { processClassesMapping } from '../api/client'
import { StepHeading, UploadFlowSteps } from '../components/upload/UploadFlowSteps'
import { Toast, useToast } from '../components/ui/Toast'
import type { ClassesMappingResult } from '../types'

const PROGRESS_STEPS = [
  'Reading PDF...',
  'Extracting text...',
  'Parsing classes...',
  'Mapping hurdles...',
  'Building Final Tier...',
  'Generating Excel file...',
  'Finalizing...',
]

export function ClassesMappingPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [dealName, setDealName] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progressIndex, setProgressIndex] = useState(0)
  const [result, setResult] = useState<ClassesMappingResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { toast, showToast, hideToast } = useToast()

  useEffect(() => {
    if (!isProcessing) return undefined

    setProgressIndex(0)
    const timer = window.setInterval(() => {
      setProgressIndex((current) =>
        current < PROGRESS_STEPS.length - 1 ? current + 1 : current
      )
    }, 12000)

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
    if (ext !== 'pdf') {
      setFile(null)
      setError('Please upload a PDF (.pdf) file.')
      showToast('Please upload a PDF (.pdf) file.', 'error')
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

  async function onGenerate() {
    if (!file || isProcessing) return

    setIsProcessing(true)
    setError(null)
    setResult(null)

    try {
      const data = await processClassesMapping(file, {
        dealName: dealName.trim() || undefined,
      })
      setResult(data)
      setProgressIndex(PROGRESS_STEPS.length - 1)
      showToast('Class mapping file generated successfully.', 'success')
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
          <h1>PDF Classes Mapping</h1>
          <p className="page-description">
            Generate Class Mapping ETL files from a Cash Flow Portal classes PDF.
            Scanned PDFs use OCR and can take 2–3 minutes.
          </p>
        </div>
      </div>

      <section className="card upload-flow-banner">
        <UploadFlowSteps
          steps={[
            { title: 'Upload Classes PDF' },
            { title: 'Generate Class Mapping' },
          ]}
        />
      </section>

      <div className="cashflow-mapping-grid">
        <section className="card cashflow-mapping-card">
          <StepHeading step={1}>Upload Classes PDF</StepHeading>
          <p className="cashflow-mapping-help">
            Upload the Cash Flow &quot;Edit classes and waterfalls&quot; PDF export. The processor
            extracts classes, hurdles, and final tiers into Class_Mapping_FILLED.xlsx.
          </p>

          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label htmlFor="dealNameOverride">Deal Name (optional)</label>
            <input
              id="dealNameOverride"
              type="text"
              value={dealName}
              disabled={isProcessing}
              placeholder="Override deal name if PDF parsing misses it"
              onChange={(event) => setDealName(event.target.value)}
            />
            <small>Leave blank to use the deal name detected from the PDF.</small>
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
                {file ? file.name : 'Drag & drop your .pdf file here'}
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
            accept=".pdf,application/pdf"
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
              Step 1 — Browse PDF
            </button>
          </div>

          <StepHeading step={2}>Generate Class Mapping</StepHeading>
          <div className="cashflow-mapping-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!file || isProcessing}
              onClick={onGenerate}
            >
              {isProcessing ? <span className="btn-spinner" /> : null}
              Step 2 — Generate Class Mapping
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
                  Class mapping file generated successfully.
                </div>

                {result.summary.dealName ? (
                  <p className="cashflow-mapping-help" style={{ marginBottom: '1rem' }}>
                    Deal: <strong>{result.summary.dealName}</strong>
                    {result.summary.targetRaise
                      ? ` · Target raise: ${result.summary.targetRaise}`
                      : ''}
                  </p>
                ) : null}

                <div className="stats-grid cashflow-summary-grid classes-summary-grid">
                  <div className="stat-card">
                    <div className="stat-value">{result.summary.classes}</div>
                    <div className="stat-label">Classes Created</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{result.summary.hurdles}</div>
                    <div className="stat-label">Hurdles Created</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{result.summary.finalTiers}</div>
                    <div className="stat-label">Final Tiers</div>
                  </div>
                  <div className={`stat-card${result.summary.warnings ? ' warning' : ''}`}>
                    <div className="stat-value">{result.summary.warnings}</div>
                    <div className="stat-label">Warnings</div>
                  </div>
                </div>

                <div className="cashflow-downloads">
                  <h3>Generated Files</h3>
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
                          <span>Class_Mapping_FILLED.xlsx</span>
                          <a
                            className="btn btn-secondary btn-sm"
                            href={deal.downloads.mapping}
                            download
                          >
                            Download
                          </a>
                        </div>
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
