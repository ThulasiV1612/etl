import { MapPin } from "lucide-react"
import {
  isFilledPreviewAssetValue,
  type OfferingPreviewAssetBlock,
} from "../utils/offeringPreviewAssets"

export interface OfferingPreviewAssetBentoCardProps {
  block: OfferingPreviewAssetBlock
}

export function OfferingPreviewAssetBentoCard({
  block,
}: OfferingPreviewAssetBentoCardProps) {
  const metricRows: { label: string; value: string }[] = []
  if (isFilledPreviewAssetValue(block.assetType)) {
    metricRows.push({ label: "Asset type", value: block.assetType })
  }
  for (const pair of block.additionalInfo) {
    if (pair.value.trim()) metricRows.push(pair)
  }

  return (
    <article className="deal_offer_pf_bento_asset_card">
      <div className="deal_offer_pf_bento_asset_body">
        <div className="deal_offer_pf_bento_asset_head">
          <span className="deal_offer_pf_bento_asset_pin" aria-hidden>
            <MapPin size={15} strokeWidth={2} />
          </span>
          <div className="deal_offer_pf_bento_asset_head_text">
            <h3 className="deal_offer_pf_bento_asset_name">{block.name}</h3>
            {block.address ? (
              <p className="deal_offer_pf_bento_asset_address">{block.address}</p>
            ) : null}
          </div>
        </div>

        {metricRows.length > 0 ? (
          <dl className="deal_offer_pf_bento_asset_metrics">
            {metricRows.map((m, i) => (
              <div
                key={`${m.label}-${i}`}
                className="deal_offer_pf_bento_asset_metric"
              >
                <dt>{m.label}</dt>
                <dd>{m.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="deal_offer_pf_assets_image_note deal_offer_pf_muted">
            No additional asset information yet.
          </p>
        )}
      </div>
    </article>
  )
}
