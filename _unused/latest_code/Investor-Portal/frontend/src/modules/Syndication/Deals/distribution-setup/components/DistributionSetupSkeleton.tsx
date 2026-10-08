export function DistributionSetupSkeleton() {
  return (
    <div
      className="ds_skeleton"
      role="status"
      aria-label="Loading distribution setup"
    >
      <div className="ds_skel_block ds_skel_switch" />
      <div className="ds_skel_layout">
        <div className="ds_skel_block ds_skel_main" />
        <div className="ds_skel_block ds_skel_aside" />
      </div>
    </div>
  )
}
