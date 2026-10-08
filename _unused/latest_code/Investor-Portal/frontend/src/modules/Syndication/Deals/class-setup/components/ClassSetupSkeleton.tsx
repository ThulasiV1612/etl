export function ClassSetupSkeleton() {
  return (
    <div className="cs_skeleton" role="status" aria-label="Loading class setup">
      <div className="cs_skel_block" style={{ height: 120 }} />
      <div className="cs_skel_block" style={{ height: 160 }} />
      <div className="cs_skel_block" style={{ height: 100 }} />
      <div className="cs_skel_block" style={{ height: 220 }} />
    </div>
  )
}
