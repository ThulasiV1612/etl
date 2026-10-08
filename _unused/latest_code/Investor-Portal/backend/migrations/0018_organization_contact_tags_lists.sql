-- CRM tag/list vocabulary per organization (company). Populated when contacts
-- are saved and backfilled once from existing `contact` JSON arrays.

CREATE TABLE IF NOT EXISTS public.organization_contact_tag (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_contact_tag_org_name_uidx UNIQUE (organization_id, name)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.organization_contact_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_contact_list_org_name_uidx UNIQUE (organization_id, name)
);
--> statement-breakpoint
INSERT INTO public.organization_contact_tag (organization_id, name)
SELECT DISTINCT u.organization_id, trim(t.tag)
FROM public.contact c
INNER JOIN public.users u ON u.id = c.created_by
CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(c.tags, '[]'::jsonb)) AS t(tag)
WHERE u.organization_id IS NOT NULL
  AND length(trim(t.tag)) > 0
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO public.organization_contact_list (organization_id, name)
SELECT DISTINCT u.organization_id, trim(t.tag)
FROM public.contact c
INNER JOIN public.users u ON u.id = c.created_by
CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(c.lists, '[]'::jsonb)) AS t(tag)
WHERE u.organization_id IS NOT NULL
  AND length(trim(t.tag)) > 0
ON CONFLICT DO NOTHING;
