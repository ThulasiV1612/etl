import { ConfirmDeleteModal } from "@/common/components/ConfirmDeleteModal"

interface EsignTemplateDeleteConfirmModalProps {
  open: boolean
  displayName: string
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}

const DELETE_MESSAGE =
  "Are you sure you want to delete this file? This action cannot be undone."

export function EsignTemplateDeleteConfirmModal({
  open,
  displayName,
  busy,
  onCancel,
  onConfirm,
}: EsignTemplateDeleteConfirmModalProps) {
  return (
    <ConfirmDeleteModal
      open={open}
      message={DELETE_MESSAGE}
      itemLabel={displayName}
      busy={busy}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  )
}
