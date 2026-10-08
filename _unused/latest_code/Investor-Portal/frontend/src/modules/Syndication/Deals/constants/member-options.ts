/**
 * Legacy label resolution for saved drafts that still reference these ids (not shown in the UI
 * when the directory API returns no users). Live options come from `fetchUsersForMemberSelect`.
 */
export const MEMBER_SELECT_OPTIONS = [
  { value: "", label: "Select member" },
  {
    value: "rebecca_duffy",
    label: "Rebecca Duffy — rebecca.duffy@example.com",
  },
  {
    value: "nigam_family",
    label: "Nigam Family LLC — contact@nigamfamily.com",
  },
  {
    value: "j_smith",
    label: "J. Smith — j.smith@example.com",
  },
] as const
