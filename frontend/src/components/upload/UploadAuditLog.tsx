import { getErrorReportUrl } from '../../api/client'
import type { JobDetailsResponse } from '../../types'

export interface AuditRow {
  rowNumber: number
  excelRow: string
  status: 'EXPORTED' | 'NOT_EXPORTED'
  entityId: string | null
  columnName: string | null
  reason: string | null
}

interface UploadAuditLogProps {
  jobDetails: JobDetailsResponse | null
  isLoading?: boolean
  uploadLabel?: string
}

export function buildAuditRows(jobDetails: JobDetailsResponse): AuditRow[] {
  const errorsByRow = new Map<number, Array<{ column: string; message: string }>>()

  for (const error of jobDetails.errors) {
    const row = error.row_number
    if (!row) continue
    const list = errorsByRow.get(row) || []
    list.push({
      column: error.column_name || '-',
      message: error.error_message,
    })
    errorsByRow.set(row, list)
  }

  if (jobDetails.records.length) {
    return jobDetails.records.map((record) => {
      const rowErrors = errorsByRow.get(record.row_number) || []
      const exported = record.status === 'SUCCESS'
      const successColumns = record.column_name || null
      const failedColumns =
        rowErrors.map((item) => item.column).filter(Boolean).join(', ') ||
        record.column_name ||
        null

      return {
        rowNumber: record.row_number,
        excelRow: `Row ${record.row_number}`,
        status: exported ? 'EXPORTED' : 'NOT_EXPORTED',
        entityId: record.entity_id,
        columnName: exported ? successColumns : failedColumns,
        reason: exported
          ? record.error_message || 'Exported successfully'
          : record.error_message ||
            rowErrors.map((item) => item.message).join(' · ') ||
            'Record was not exported',
      }
    })
  }

  return jobDetails.errors.map((error, index) => ({
    rowNumber: error.row_number || index + 1,
    excelRow: error.row_number ? `Row ${error.row_number}` : 'File',
    status: 'NOT_EXPORTED' as const,
    entityId: null,
    columnName: error.column_name || null,
    reason: error.error_message,
  }))
}

export function UploadAuditLog({ jobDetails, isLoading, uploadLabel }: UploadAuditLogProps) {
  const rows = jobDetails ? buildAuditRows(jobDetails) : []
  const exportedCount = rows.filter((row) => row.status === 'EXPORTED').length
  const failedCount = rows.filter((row) => row.status === 'NOT_EXPORTED').length

  return (
    <section className="card audit-log-card">
      <div className="audit-log-header">
        <div>
          <h2>Upload Audit Log</h2>
          <p className="audit-log-subtitle">
            {uploadLabel
              ? `${uploadLabel} — exported columns and row status`
              : 'Track exported columns, exported rows, and rows that failed'}
          </p>
        </div>
        {jobDetails && jobDetails.job.failed_count > 0 && (
          <a href={getErrorReportUrl(jobDetails.job.job_id)} className="btn btn-secondary btn-sm">
            Download errors
          </a>
        )}
      </div>

      {isLoading && <p className="audit-log-empty">Loading audit log...</p>}

      {!isLoading && !jobDetails && (
        <p className="audit-log-empty">Upload an Excel file to see the audit log for each row.</p>
      )}

      {!isLoading && jobDetails && (
        <>
          <div className="audit-summary-strip">
            <div className="audit-summary-item">
              <span className="audit-summary-label">File</span>
              <span className="audit-summary-value">{jobDetails.job.file_name}</span>
            </div>
            <div className="audit-summary-item">
              <span className="audit-summary-label">Job</span>
              <span className="audit-summary-value">#{jobDetails.job.job_id}</span>
            </div>
            <div className="audit-summary-item">
              <span className="audit-summary-label">Total rows</span>
              <span className="audit-summary-value">{jobDetails.job.total_records}</span>
            </div>
            <div className="audit-summary-item success">
              <span className="audit-summary-label">Exported</span>
              <span className="audit-summary-value">{exportedCount}</span>
            </div>
            <div className="audit-summary-item error">
              <span className="audit-summary-label">Not exported</span>
              <span className="audit-summary-value">{failedCount}</span>
            </div>
            <div className="audit-summary-item">
              <span className="audit-summary-label">Status</span>
              <span className={`status-badge status-${jobDetails.job.status.toLowerCase()}`}>
                {jobDetails.job.status}
              </span>
            </div>
          </div>

          {rows.length === 0 ? (
            <p className="audit-log-empty">No row-level audit data for this upload yet.</p>
          ) : (
            <div className="audit-table-wrap">
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>Excel row</th>
                    <th>Status</th>
                    <th>Exported ID</th>
                    <th>Exported columns</th>
                    <th>Reason / notes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={`${row.rowNumber}-${row.excelRow}`}
                      className={row.status === 'NOT_EXPORTED' ? 'audit-row-failed' : ''}
                    >
                      <td>{row.excelRow}</td>
                      <td>
                        <span className={`audit-status audit-status-${row.status.toLowerCase()}`}>
                          {row.status === 'EXPORTED' ? 'Exported' : 'Not exported'}
                        </span>
                      </td>
                      <td className="audit-entity-id">{row.entityId || '—'}</td>
                      <td className="audit-columns">{row.columnName || '—'}</td>
                      <td>{row.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  )
}
