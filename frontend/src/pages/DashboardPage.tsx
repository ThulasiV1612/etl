import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getDashboard } from '../api/client'
import type { DashboardResponse, EtlJob } from '../types'

export function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load dashboard'))
  }, [])

  if (error) {
    return <div className="card error-panel">{error}</div>
  }

  if (!data) {
    return <div className="card loading-panel">Loading dashboard...</div>
  }

  const { stats, recentJobs } = data

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Monitoring</p>
          <h1>ETL Dashboard</h1>
          <p className="page-description">
            Track uploads, job status, processed records, and error counts across all ETL migrations.
          </p>
        </div>
        <Link to="/etl-upload" className="btn btn-primary">
          Upload Hub
        </Link>
      </header>

      <div className="stats-grid dashboard-stats">
        <div className="stat-card">
          <p className="stat-value">{stats.total_uploads}</p>
          <p className="stat-label">Total Uploads</p>
        </div>
        <div className="stat-card success">
          <p className="stat-value">{stats.successful_jobs}</p>
          <p className="stat-label">Successful Jobs</p>
        </div>
        <div className="stat-card error">
          <p className="stat-value">{stats.failed_jobs}</p>
          <p className="stat-label">Failed / Partial</p>
        </div>
        <div className="stat-card warning">
          <p className="stat-value">{stats.running_jobs}</p>
          <p className="stat-label">Running Jobs</p>
        </div>
        <div className="stat-card">
          <p className="stat-value">{stats.records_processed}</p>
          <p className="stat-label">Records Processed</p>
        </div>
        <div className="stat-card error">
          <p className="stat-value">{stats.error_count}</p>
          <p className="stat-label">Error Count</p>
        </div>
      </div>

      <section className="card">
        <div className="section-header">
          <h2>Recent Jobs</h2>
        </div>

        <div className="jobs-table">
          <table>
            <thead>
              <tr>
                <th>Job ID</th>
                <th>Type</th>
                <th>File</th>
                <th>Status</th>
                <th>Success</th>
                <th>Failed</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {recentJobs.map((job: EtlJob) => (
                <tr key={job.job_id}>
                  <td>
                    <Link to={`/jobs/${job.job_id}`}>#{job.job_id}</Link>
                  </td>
                  <td>{job.job_type}</td>
                  <td>{job.file_name}</td>
                  <td>
                    <span className={`status-badge status-${job.status.toLowerCase()}`}>
                      {job.status}
                    </span>
                  </td>
                  <td>{job.success_count}</td>
                  <td>{job.failed_count}</td>
                  <td>{new Date(job.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {!recentJobs.length && (
                <tr>
                  <td colSpan={7} className="empty-row">No ETL jobs yet. Start your first upload.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
