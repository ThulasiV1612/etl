-- Per-deal Assets section rows (property + additional information).
-- One row per asset; additional attributes stored as JSON text columns.

CREATE TABLE IF NOT EXISTS public.deal_asset (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.add_deal_form (id) ON DELETE CASCADE,
  /** Frontend / client asset id, e.g. primary-{dealId} or asset-{timestamp} */
  client_asset_id text NOT NULL,
  property_name text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT '',
  street_address_1 text NOT NULL DEFAULT '',
  street_address_2 text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT '',
  zip_code text NOT NULL DEFAULT '',
  /** Formatted address display string (Assets table) */
  address_display text NOT NULL DEFAULT '',
  asset_type text NOT NULL DEFAULT '',
  image_count integer NOT NULL DEFAULT 0,
  archived boolean NOT NULL DEFAULT false,
  /** JSON array: { label, value }[] — display pairs for Additional information */
  additional_info_json text NOT NULL DEFAULT '[]',
  /** JSON array: full Additional information form rows (id, label, kind, value, …) */
  attr_rows_json text NOT NULL DEFAULT '[]',
  /** JSON string array of image preview / gallery URLs for this asset */
  image_preview_urls_json text NOT NULL DEFAULT '[]',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deal_asset_deal_client_id_unique UNIQUE (deal_id, client_asset_id)
);

CREATE INDEX IF NOT EXISTS deal_asset_deal_id_idx
  ON public.deal_asset (deal_id);

COMMENT ON TABLE public.deal_asset IS
  'Offering Assets section: one row per deal asset including additional information JSON.';

COMMENT ON COLUMN public.deal_asset.additional_info_json IS
  'JSON: [{ "label": string, "value": string }, ...]';

COMMENT ON COLUMN public.deal_asset.attr_rows_json IS
  'JSON: [{ "id", "label", "kind", "value", "unitSuffix?", "na?", "preset?" }, ...]';
