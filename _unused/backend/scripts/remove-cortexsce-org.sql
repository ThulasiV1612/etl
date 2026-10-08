-- Remove Cortexsce org data inserted by seed-cortexsce-org.sql
-- Safe to re-run: deletes by known ids / user / company.

BEGIN;

DELETE FROM public.user_auth_tokens
WHERE user_id = 'b0077501-e91e-4ebf-8422-158f9788e397';

DELETE FROM public.user_page_navigations
WHERE user_id = 'b0077501-e91e-4ebf-8422-158f9788e397';

DELETE FROM public.user_portal_sessions
WHERE user_id = 'b0077501-e91e-4ebf-8422-158f9788e397';

DELETE FROM public.soc_auth_audit_logs
WHERE id IN (
  '12a4e418-d90a-4ea0-8468-a8672f733b02',
  'ceb44915-4d21-4ea5-828d-ce072b13dc4c',
  'd9795c43-6083-4cd3-9931-04b25086544b',
  'f24cc708-d9bc-4f7e-815d-099524069413',
  '87069ed5-6f91-4799-bfe3-14e2603b542e',
  '799d7e74-363a-4069-bacb-dce82f1225a5',
  'fad31937-bdeb-4c7e-8b93-f7e209718abd',
  '47f4bd6f-e2f2-4707-bcf9-98cd692c91e5',
  'eab7f2a8-12aa-47d5-bef5-95b1c6a43418',
  '954cef5b-b54c-479a-8665-128f06593404',
  '4f1be4be-f0ec-44f2-b380-d8e9ffbc4a39',
  '4249b885-6de1-4dc9-9ed2-c75fff47da98',
  '51d76a28-9b9b-4738-9eeb-a201288516b3',
  '0dd14482-d4c1-498c-8a1c-15af7386451c',
  '4634acad-7786-4f22-bc61-05a19d4e5ce9',
  'feddec40-0af8-463c-b721-1c9b88f6a16d',
  '09c95e49-2a1e-4d6a-aa0b-ef4716d4a541',
  '7988c367-64f1-42c7-9686-c6f425a23dd8',
  'bdbcc354-c18b-4015-b49b-669d03cfcef3',
  'a2d1d0a3-0efd-4fe4-85f0-921d1a5de080',
  '9191c4e0-da85-4230-8b76-e922008fa2ef'
)
OR user_id = 'b0077501-e91e-4ebf-8422-158f9788e397'
OR identifier = 'matt@cortexsce.com'
OR request_url LIKE '%633c510a-292a-425c-b11f-3591340c0985%'
OR request_url LIKE '%matt%40cortexsce.com%';

DELETE FROM public.user_company_membership
WHERE user_id = 'b0077501-e91e-4ebf-8422-158f9788e397'
   OR company_id = '633c510a-292a-425c-b11f-3591340c0985';

DELETE FROM public.users
WHERE id = 'b0077501-e91e-4ebf-8422-158f9788e397';

DELETE FROM public.companies
WHERE id = '633c510a-292a-425c-b11f-3591340c0985';

COMMIT;
