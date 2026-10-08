import type { DealInvestorClass } from "../types/deal-investor-class.types"
import { CardCompactAmount } from "../../../../common/components/card-compact-amount/CardCompactAmount"
import {
  investorClassStatusLabel,
  investorClassVisibilityLabel,
} from "../utils/offeringDisplayLabels"

export interface OfferingPreviewClassBentoCardProps {
  investorClass: DealInvestorClass
}

export function OfferingPreviewClassBentoCard({
  investorClass,
}: OfferingPreviewClassBentoCardProps) {
  const name = investorClass.name?.trim() || "Untitled class"
  const status = investorClassStatusLabel(investorClass.status ?? "")
  const visibility = investorClassVisibilityLabel(investorClass.visibility ?? "")

  return (
    <article className="deal_offer_pf_bento_class_card">
      <h3 className="deal_offer_pf_bento_class_card_title">{name}</h3>
      <dl className="deal_offer_pf_bento_class_card_meta">
        <div className="deal_offer_pf_bento_class_card_row">
          <dt>Minimum investment</dt>
          <dd>
            <CardCompactAmount amount={investorClass.minimumInvestment} />
          </dd>
        </div>
        <div className="deal_offer_pf_bento_class_card_row">
          <dt>Status</dt>
          <dd>{status}</dd>
        </div>
        <div className="deal_offer_pf_bento_class_card_row">
          <dt>Visibility</dt>
          <dd>{visibility}</dd>
        </div>
      </dl>
    </article>
  )
}
