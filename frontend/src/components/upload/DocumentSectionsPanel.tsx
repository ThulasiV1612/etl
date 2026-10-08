import { useMemo, useRef, useState } from 'react'
import { uploadMediaFiles } from '../../api/client'
import type { EntityKey, MediaUploadResult } from '../../types'

const DOCUMENT_SECTIONS: Array<{ key: string; label: string; isCustom?: boolean }> = [
  { key: 'general', label: 'General' },
  { key: 'offering_documents', label: 'Offering Documents' },
  { key: 'monthly_reports', label: 'Monthly Reports' },
  { key: 'k1s', label: "K1's" },
  { key: 'more', label: 'More', isCustom: true },
]

const DOCUMENT_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip'
const DOCUMENT_HINT = '.pdf, .doc, .docx, .xls, .xlsx, .csv, .txt, .zip (max 25MB each)'

interface DocumentSectionsPanelProps {
  entityType: EntityKey
  organizationId?: string
  dealId?: string
  onUploadComplete: (result: MediaUploadResult) => void
  onError: (message: string) => void
  onSuccess: (message: string) => void
}

function getSectionLabel(sectionKey: string, customName: string) {
  if (sectionKey === 'more') return customName.trim()
  return DOCUMENT_SECTIONS.find((section) => section.key === sectionKey)?.label || sectionKey
}

export function DocumentSectionsPanel({
  entityType,
  organizationId,
  dealId,
  onUploadComplete,
  onError,
  onSuccess,
}: DocumentSectionsPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [activeSection, setActiveSection] = useState<string>('general')
  const [customSectionName, setCustomSectionName] = useState('')
  const [sectionFiles, setSectionFiles] = useState<Record<string, File[]>>({})
  const [isUploading, setIsUploading] = useState(false)
  const [lastUploadSection, setLastUploadSection] = useState<string | null>(null)

  const activeSectionMeta = DOCUMENT_SECTIONS.find((section) => section.key === activeSection)
  const isCustomSection = activeSection === 'more'
  const resolvedSectionName = getSectionLabel(activeSection, customSectionName)
  const canUploadToSection = !isCustomSection || customSectionName.trim().length > 0
  const pendingFiles = sectionFiles[activeSection] || []

  const sectionSummary = useMemo(
    () =>
      DOCUMENT_SECTIONS.map((section) => ({
        ...section,
        fileCount: (sectionFiles[section.key] || []).length,
      })),
    [sectionFiles]
  )

  function addFiles(files: FileList | null) {
    if (!files?.length || !canUploadToSection) return

    const nextFiles = Array.from(files)
    setSectionFiles((prev) => ({
      ...prev,
      [activeSection]: [...(prev[activeSection] || []), ...nextFiles],
    }))
  }

  function removeFile(index: number) {
    setSectionFiles((prev) => ({
      ...prev,
      [activeSection]: (prev[activeSection] || []).filter((_, fileIndex) => fileIndex !== index),
    }))
  }

  function clearSectionFiles() {
    setSectionFiles((prev) => ({
      ...prev,
      [activeSection]: [],
    }))
    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleUpload() {
    if (!canUploadToSection) {
      onError('Enter a section name before uploading')
      return
    }

    if (!pendingFiles.length) {
      onError('Select at least one document to upload')
      return
    }

    setIsUploading(true)

    try {
      const result = await uploadMediaFiles({
        files: pendingFiles,
        mediaType: 'document',
        entityType,
        dealId,
        organizationId,
        documentSection: resolvedSectionName,
      })

      setLastUploadSection(resolvedSectionName)
      setSectionFiles((prev) => ({
        ...prev,
        [activeSection]: [],
      }))
      if (inputRef.current) inputRef.current.value = ''
      onUploadComplete(result)
      onSuccess(`${result.count} file(s) uploaded to ${resolvedSectionName}`)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Document upload failed')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="document-sections">
      <div className="document-sections-header">
        <div>
          <h3>Document Sections</h3>
          <p>Choose a section, add files, and upload. Use <strong>More</strong> for custom section names.</p>
        </div>
      </div>

      <div className="document-section-tabs">
        {sectionSummary.map((section) => (
          <button
            key={section.key}
            type="button"
            className={`document-section-tab${activeSection === section.key ? ' active' : ''}`}
            onClick={() => setActiveSection(section.key)}
          >
            <span>{section.label}</span>
            {section.fileCount > 0 && <span className="section-badge">{section.fileCount}</span>}
          </button>
        ))}
      </div>

      <div className="document-section-panel">
        <div className="document-section-panel-header">
          <div>
            <p className="section-eyebrow">Active section</p>
            <h4>{isCustomSection && !customSectionName.trim() ? 'Custom Section' : resolvedSectionName}</h4>
          </div>
          {activeSectionMeta?.isCustom && (
            <span className="section-tag">Custom</span>
          )}
        </div>

        {isCustomSection && (
          <div className="form-group">
            <label htmlFor="customSectionName">
              Section name <span className="required">*</span>
            </label>
            <input
              id="customSectionName"
              type="text"
              value={customSectionName}
              onChange={(e) => setCustomSectionName(e.target.value)}
              placeholder="e.g. Legal Agreements, Investor Updates"
            />
            <small>Enter a name, then select documents for this section.</small>
          </div>
        )}

        <div
          className={`file-dropzone compact${canUploadToSection ? '' : ' disabled'}`}
          onClick={() => canUploadToSection && inputRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && canUploadToSection && inputRef.current?.click()}
          role="button"
          tabIndex={0}
        >
          <input
            ref={inputRef}
            type="file"
            accept={DOCUMENT_ACCEPT}
            multiple
            hidden
            disabled={!canUploadToSection}
            onChange={(e) => addFiles(e.target.files)}
          />

          <div className="dropzone-content">
            <p className="dropzone-title">
              {canUploadToSection
                ? `Upload to ${resolvedSectionName}`
                : 'Enter a section name first'}
            </p>
            <p className="dropzone-hint">{DOCUMENT_HINT}</p>
          </div>
        </div>

        {pendingFiles.length > 0 && (
          <ul className="media-file-list">
            {pendingFiles.map((file, index) => (
              <li key={`${file.name}-${index}`}>
                <span>{file.name}</span>
                <button type="button" className="btn-text danger" onClick={() => removeFile(index)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="form-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={clearSectionFiles}
            disabled={!pendingFiles.length || isUploading}
          >
            Clear
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleUpload}
            disabled={isUploading || !pendingFiles.length || !canUploadToSection}
          >
            {isUploading ? <span className="btn-spinner" /> : `Upload to ${resolvedSectionName}`}
          </button>
        </div>

        {lastUploadSection && (
          <p className="section-upload-note">
            Last upload saved under <strong>{lastUploadSection}</strong>
          </p>
        )}
      </div>
    </div>
  )
}
