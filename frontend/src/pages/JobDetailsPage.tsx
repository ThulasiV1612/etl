import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getErrorReportUrl, getJobDetails, retryFailedJob } from '../api/client'
import { Toast, useToast } from '../components/ui/Toast'
import type { JobDetailsResponse } from '../types'

export function JobDetailsPage() {
  const { jobId } = useParams()
  const [data, setData] = useState<JobDetailsResponse | null>(null)
  const [isRetrying, setIsRetrying] = useState(false)
  const { toast, showToast, hideToast } = useToast()

  async function loadJob() {
    if (!jobId) return
    const details = await getJobDetails(Number(jobId))
    setData(details)
  }

  useEffect(() => {
    loadJob().catch((error) => {
      showToast(error instanceof Error ? error.message : 'Failed to load job', 'error')
    })
  }, [jobId, showToast])

  async function handleRetry() {
    if (!jobId) return

    setIsRetrying(true)
    try {
      await retryFailedJob(Number(jobId))
      await loadJob()
      showToast('Retry completed for failed records')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Retry failed', 'error')
    } finally {
      setIsRetrying(false)
    }
  }

  if (!data) {
    return <div className="card loading-panel">Loading job details...</div>
  }

  const { job, file, stages, errors, records } = data

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Job Details</p>
          <h1>Job #{job.job_id}</h1>
          <p className="page-description">
            {job.job_type} · {job.file_name}
          </p>
        </div>
        <div className="header-actions">
          <Link to="/dashboard" className="btn btn-secondary">Back to Dashboard</Link>
          {job.failed_count > 0 && (
            <button type="button" className="btn btn-primary" disabled={isRetrying} onClick={handleRetry}>
              {isRetrying ? <span className="btn-spinner" /> : 'Retry Failed Records'}
            </button>
          )}
          <a href={getErrorReportUrl(job.job_id)} className="btn btn-secondary">
            Download Error Excel
          </a>
        </div>
      </header>

      <div className="content-grid job-details-grid">
        <section className="card">
          <h2>Summary</h2>
          <div className="stats-grid compact">
            <div className="stat-card">
              <p className="stat-value">{job.total_records}</p>
              <p className="stat-label">Total</p>
            </div>
            <div className="stat-card success">
              <p className="stat-value">{job.success_count}</p>
              <p className="stat-label">Success</p>
            </div>
            <div className="stat-card error">
              <p className="stat-value">{job.failed_count}</p>
              <p className="stat-label">Failed</p>
            </div>
          </div>

          <dl className="detail-list">
            <div><dt>Status</dt><dd><span className={`status-badge status-${job.status.toLowerCase()}`}>{job.status}</span></dd></div>
            <div><dt>Created By</dt><dd>{job.created_by}</dd></div>
            <div><dt>Start Time</dt><dd>{job.start_time ? new Date(job.start_time).toLocaleString() : '-'}</dd></div>
            <div><dt>End Time</dt><dd>{job.end_time ? new Date(job.end_time).toLocaleString() : '-'}</dd></div>
            {file && (
              <>
                <div><dt>Uploaded File</dt><dd>{file.file_name}</dd></div>
                <div><dt>File Size</dt><dd>{(file.file_size / 1024).toFixed(1)} KB</dd></div>
              </>
            )}
          </dl>
        </section>

        <section className="card">
          <h2>Processing Stages</h2>
          <div className="stage-timeline">
            {stages.map((stage) => (
              <div key={stage.stage_log_id} className={`stage-item stage-${stage.status.toLowerCase()}`}>
                <div className="stage-marker" />
                <div>
                  <p className="stage-name">{stage.stage_name}</p>
                  <p className="stage-meta">
                    {stage.status}
                    {stage.end_time ? ` · ${new Date(stage.end_time).toLocaleString()}` : ''}
                  </p>
                  {stage.message && <p className="stage-message">{stage.message}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card">
        <h2>Row-Level Errors</h2>
        <div className="errors-table">
          <table>
            <thead>
              <tr>
                <th>Row</th>
                <th>Column</th>
                <th>Type</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {errors.map((error) => (
                <tr key={error.error_id}>
                  <td>{error.row_number}</td>
                  <td>{error.column_name || '-'}</td>
                  <td>{error.error_type}</td>
                  <td>{error.error_message}</td>
                </tr>
              ))}
              {!errors.length && (
                <tr>
                  <td colSpan={4} className="empty-row">No errors recorded for this job.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Record Status</h2>
        <div className="errors-table">
          <table>
            <thead>
              <tr>
                <th>Row</th>
                <th>Status</th>
                <th>Entity ID</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {records.slice(0, 100).map((record) => (
                <tr key={record.row_number}>
                  <td>{record.row_number}</td>
                  <td>{record.status}</td>
                  <td>{record.entity_id || '-'}</td>
                  <td>{record.error_message || '-'}</td>
                </tr>
              ))}
              {!records.length && (
                <tr>
                  <td colSpan={4} className="empty-row">No row-level records tracked yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
    </>
  )
}
