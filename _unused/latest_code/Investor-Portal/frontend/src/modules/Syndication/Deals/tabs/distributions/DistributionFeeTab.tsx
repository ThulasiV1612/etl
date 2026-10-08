import { Link } from "react-router-dom"

type DistributionFeeTabProps = {
  dealId: string
  dealName?: string
}

/**
 * Deal Detail → Distributions → Acquisition Fee.
 * Fee configuration lives on Distribution Setup.
 */
export function DistributionFeeTab({
  dealId,
  dealName,
}: DistributionFeeTabProps) {
  const id = dealId.trim()
  const href = id
    ? `/deals/${encodeURIComponent(id)}/distribution-setup`
    : ""

  return (
    <div
      className="deal_dist_fee_tab"
      role="region"
      aria-label="Acquisition fee"
    >
      <div className="um_panel um_members_tab_panel deals_list_table_panel deals_list_card_surface deal_inv_table_panel deal_dist_panel">
        <div
          className="um_toolbar um_toolbar_export_then_search deal_dist_toolbar"
          role="toolbar"
          aria-label="Acquisition fee"
        >
          <div className="deal_dist_toolbar_copy">
            <h2 className="deal_dist_heading">Acquisition Fee</h2>
            <p className="deal_dist_lead">
              {dealName?.trim()
                ? `Configure fee name, cash, and class split for ${dealName.trim()} in Distribution Setup.`
                : "Configure fee name, cash, and class split in Distribution Setup."}
            </p>
          </div>
          {href ? (
            <div className="um_toolbar_actions deal_dist_toolbar_actions">
              <Link
                to={href}
                state={{ returnTab: "distributions" as const }}
                className="um_btn_primary deals_list_add_link"
              >
                Open Distribution Setup
              </Link>
            </div>
          ) : null}
        </div>

        <div className="deal_dist_fee_empty" role="status">
          <p className="deal_dist_fee_empty_title">
            Fee settings are on Distribution Setup
          </p>
          <p className="deal_dist_fee_empty_copy">
            Use the Acquisition Fee tab there to name the fee, set cash /
            period / dates, and allocate percentages across investor classes
            (must total 100%). A class is paid only when it has a percentage
            and investors; an allocated class with no investors blocks the
            whole class-scoped distribution.
          </p>
        </div>
      </div>
    </div>
  )
}
