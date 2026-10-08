import { ExternalLink, MapPin } from "lucide-react"
import { dealDisplayFieldText, type DealDetailApi } from "../../api/dealsApi"

/** Full address string for Google Maps embed / search. */
export function buildDealLocationQuery(detail: DealDetailApi): string {
  const parts: string[] = []
  const push = (v: string | undefined) => {
    const t = dealDisplayFieldText(v)
    if (t) parts.push(t)
  }
  push(detail.propertyName)
  push(detail.addressLine1)
  push(detail.addressLine2)
  push(detail.city)
  push(detail.state)
  push(detail.zipCode)
  push(detail.country)
  return parts.join(", ")
}

export interface OfferingOverviewLocationMapProps {
  detail: DealDetailApi
  /** Portfolio preview: no duplicate title or sponsor helper text. */
  compact?: boolean
}

export function OfferingOverviewLocationMap({
  detail,
  compact = false,
}: OfferingOverviewLocationMapProps) {
  const query = buildDealLocationQuery(detail)
  const mapSrc = query
    ? `https://maps.google.com/maps?q=${encodeURIComponent(query)}&hl=en&z=15&output=embed`
    : ""
  const mapsSearchHref = query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : ""

  return (
    <section
      className={`deal_offering_location_map_section${compact ? " deal_offering_location_map_section--compact" : ""}`}
      aria-label="Property location"
    >
      {!compact ? (
        <>
          <div className="deal_offering_location_map_head">
            <span className="deal_offering_location_map_icon_wrap" aria-hidden>
              <MapPin size={18} strokeWidth={2} />
            </span>
            <h3 className="deal_offering_location_map_title">Location</h3>
          </div>
          <p className="deal_offering_overview_muted deal_offering_location_map_source">
            Pulled from the deal profile (property address). Update the address on
            the main deal / asset steps if this looks wrong.
          </p>
        </>
      ) : null}
      {!query ? (
        <p className="deal_offering_overview_muted">
          No property address on file yet. Add city, state, or street address on the
          deal profile to show a map here.
        </p>
      ) : (
        <>
          {!compact ? (
            <p className="deal_offering_location_map_address">{query}</p>
          ) : null}
          <div className="deal_offering_location_map_frame">
            <iframe
              title="Map for property location"
              className="deal_offering_location_map_iframe"
              src={mapSrc}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>
          <a
            className="deal_offering_location_map_external"
            href={mapsSearchHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={14} strokeWidth={2} aria-hidden />
            Open in Google Maps
          </a>
        </>
      )}
    </section>
  )
}
