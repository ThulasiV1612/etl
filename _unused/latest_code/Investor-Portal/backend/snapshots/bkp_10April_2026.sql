--
-- PostgreSQL database dump
--

\restrict Cm0ayffbWP7iKoisJG8wOY7rkgGopt48mWj1sVjkKk9PKA7wtVk4ZwvfZdEiaTl

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

-- Started on 2026-04-10 17:04:46

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 6 (class 2615 OID 58550)
-- Name: drizzle; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA drizzle;


ALTER SCHEMA drizzle OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 218 (class 1259 OID 58551)
-- Name: __drizzle_migrations; Type: TABLE; Schema: drizzle; Owner: postgres
--

CREATE TABLE drizzle.__drizzle_migrations (
    id integer NOT NULL,
    hash text NOT NULL,
    created_at bigint
);


ALTER TABLE drizzle.__drizzle_migrations OWNER TO postgres;

--
-- TOC entry 219 (class 1259 OID 58556)
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE; Schema: drizzle; Owner: postgres
--

CREATE SEQUENCE drizzle.__drizzle_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNER TO postgres;

--
-- TOC entry 5028 (class 0 OID 0)
-- Dependencies: 219
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: drizzle; Owner: postgres
--

ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNED BY drizzle.__drizzle_migrations.id;


--
-- TOC entry 220 (class 1259 OID 58557)
-- Name: add_deal_form; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.add_deal_form (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deal_name text NOT NULL,
    deal_type text,
    deal_stage text NOT NULL,
    sec_type text NOT NULL,
    close_date date,
    owning_entity_name text NOT NULL,
    funds_required_before_gp_sign boolean DEFAULT false,
    auto_send_funding_instructions boolean DEFAULT false,
    property_name text NOT NULL,
    country text,
    address_line_1 text,
    address_line_2 text,
    city text,
    state text,
    zip_code text,
    images text[] DEFAULT ARRAY[]::text[],
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    asset_image_path text,
    organization_id uuid,
    CONSTRAINT add_deal_form_deal_stage_check CHECK ((deal_stage = ANY (ARRAY['draft'::text, 'Draft'::text, 'raising_capital'::text, 'capital_raising'::text, 'asset_managing'::text, 'managing_asset'::text, 'liquidated'::text])))
);


ALTER TABLE public.add_deal_form OWNER TO postgres;

--
-- TOC entry 221 (class 1259 OID 58569)
-- Name: assigning_deal_user; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.assigning_deal_user (
    deal_id uuid NOT NULL,
    user_id uuid NOT NULL,
    user_added_deal uuid
);


ALTER TABLE public.assigning_deal_user OWNER TO postgres;

--
-- TOC entry 222 (class 1259 OID 58572)
-- Name: companies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    status character varying(50) DEFAULT 'active'::character varying NOT NULL
);


ALTER TABLE public.companies OWNER TO postgres;

--
-- TOC entry 223 (class 1259 OID 58579)
-- Name: company_admin_audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.company_admin_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_user_id uuid NOT NULL,
    target_company_id uuid NOT NULL,
    action character varying(32) NOT NULL,
    reason text NOT NULL,
    changes_json jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.company_admin_audit_logs OWNER TO postgres;

--
-- TOC entry 224 (class 1259 OID 58586)
-- Name: company_workspace_tab_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.company_workspace_tab_settings (
    company_id uuid NOT NULL,
    tab_key character varying(64) NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.company_workspace_tab_settings OWNER TO postgres;

--
-- TOC entry 225 (class 1259 OID 58593)
-- Name: contact; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.contact (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    first_name character varying(200) NOT NULL,
    last_name character varying(200) NOT NULL,
    email character varying(255) NOT NULL,
    phone character varying(64) DEFAULT ''::character varying NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    tags jsonb DEFAULT '[]'::jsonb NOT NULL,
    lists jsonb DEFAULT '[]'::jsonb NOT NULL,
    owners jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status character varying(32) DEFAULT 'active'::character varying NOT NULL,
    last_edit_reason text
);


ALTER TABLE public.contact OWNER TO postgres;

--
-- TOC entry 226 (class 1259 OID 58606)
-- Name: deal_investment; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.deal_investment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deal_id uuid NOT NULL,
    offering_id text DEFAULT ''::text NOT NULL,
    contact_id text DEFAULT ''::text NOT NULL,
    profile_id text DEFAULT ''::text NOT NULL,
    status text DEFAULT ''::text NOT NULL,
    investor_class text DEFAULT ''::text NOT NULL,
    doc_signed_date text,
    commitment_amount text DEFAULT ''::text NOT NULL,
    extra_contribution_amounts jsonb DEFAULT '[]'::jsonb NOT NULL,
    document_storage_path text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    contact_display_name text DEFAULT ''::text NOT NULL,
    investor_role text DEFAULT ''::text NOT NULL
);


ALTER TABLE public.deal_investment OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 58622)
-- Name: deal_investor_class; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.deal_investor_class (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deal_id uuid NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    subscription_type text DEFAULT ''::text NOT NULL,
    entity_name text DEFAULT ''::text NOT NULL,
    start_date text DEFAULT ''::text NOT NULL,
    offering_size text DEFAULT ''::text NOT NULL,
    minimum_investment text DEFAULT ''::text NOT NULL,
    price_per_unit text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    visibility text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    raise_amount_distributions text DEFAULT ''::text NOT NULL,
    billing_raise_quota text DEFAULT ''::text NOT NULL,
    advanced_options_json text DEFAULT '{}'::text NOT NULL
);


ALTER TABLE public.deal_investor_class OWNER TO postgres;

--
-- TOC entry 231 (class 1259 OID 59093)
-- Name: deal_lp_investor; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.deal_lp_investor (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deal_id uuid NOT NULL,
    added_by uuid,
    contact_member_id text DEFAULT ''::text NOT NULL,
    investor_class text DEFAULT ''::text NOT NULL,
    send_invitation_mail text DEFAULT 'no'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.deal_lp_investor OWNER TO postgres;

--
-- TOC entry 230 (class 1259 OID 58900)
-- Name: deal_member; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.deal_member (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deal_id uuid NOT NULL,
    send_invitation_mail text DEFAULT 'no'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    added_by uuid,
    contact_member_id text NOT NULL,
    deal_member_role text NOT NULL
);


ALTER TABLE public.deal_member OWNER TO postgres;

--
-- TOC entry 228 (class 1259 OID 58647)
-- Name: member_admin_audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.member_admin_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_user_id uuid NOT NULL,
    target_user_id uuid NOT NULL,
    action character varying(32) NOT NULL,
    reason text NOT NULL,
    changes_json jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.member_admin_audit_logs OWNER TO postgres;

--
-- TOC entry 229 (class 1259 OID 58654)
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    username character varying(100) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(50) DEFAULT 'user'::character varying NOT NULL,
    user_status character varying(50) DEFAULT 'active'::character varying NOT NULL,
    user_signup_completed character varying(10) DEFAULT 'true'::character varying NOT NULL,
    organization_id uuid,
    first_name character varying(100) DEFAULT ''::character varying NOT NULL,
    last_name character varying(100) DEFAULT ''::character varying NOT NULL,
    phone character varying(32) DEFAULT ''::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    company_name character varying(255) DEFAULT ''::character varying NOT NULL,
    invite_expires_at timestamp with time zone
);


ALTER TABLE public.users OWNER TO postgres;

--
-- TOC entry 4744 (class 2604 OID 58669)
-- Name: __drizzle_migrations id; Type: DEFAULT; Schema: drizzle; Owner: postgres
--

ALTER TABLE ONLY drizzle.__drizzle_migrations ALTER COLUMN id SET DEFAULT nextval('drizzle.__drizzle_migrations_id_seq'::regclass);


--
-- TOC entry 5009 (class 0 OID 58551)
-- Dependencies: 218
-- Data for Name: __drizzle_migrations; Type: TABLE DATA; Schema: drizzle; Owner: postgres
--

COPY drizzle.__drizzle_migrations (id, hash, created_at) FROM stdin;
1	35fb3b45c7a7c5d0f23ee8ba4f8c217a3bd3a02ab17bda72bbe942eb57126a17	1774699093272
2	f34822bf9dadd654084c28804a0a1f600240f1560ad284c0331fe16df138abe7	1774708226298
3	8572168a0e5090b1551e12a6c73f238451403e758ea3f9b33fdc4cf519a3541b	1774718789394
4	fd6e56a346f0a90bcbf3e53404c15762c3795252970586f3609f640dbd30e344	1774720000000
5	42f6bc2cdbeedb3b0eacb9d86a59169d08a09575b51d92a7d2f1903080e3e8a0	1774721000000
\.


--
-- TOC entry 5011 (class 0 OID 58557)
-- Dependencies: 220
-- Data for Name: add_deal_form; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.add_deal_form (id, deal_name, deal_type, deal_stage, sec_type, close_date, owning_entity_name, funds_required_before_gp_sign, auto_send_funding_instructions, property_name, country, address_line_1, address_line_2, city, state, zip_code, images, created_at, updated_at, asset_image_path, organization_id) FROM stdin;
c5799006-3016-4a09-b74f-130f59751d92	Sunrise Equity Deal	direct_syndication	asset_managing	506_b	2026-05-31	Sunrise Equity Deal	f	t	Sunset Plaza Complex	US	\N	\N	Chicago	\N	\N	{}	2026-04-10 14:08:49.219521	2026-04-10 14:08:49.219521	deal-assets/untitled_59d629af-aa8d-4ec3-b1c5-7fc4137e0464_1775812223488.jpg;deal-assets/untitled_181d979f-2ee3-48b1-8500-c77de22a416b_1775812224300.jpg	be13cca6-a8f7-451f-b8b0-4a7ede064d00
f0a1e931-6d93-4c29-b06c-81bf4c949fac	Tech Venture Series A	fund	raising_capital	506_b	2026-12-31	Tech Venture Series A	f	t	Oakwood Residential Estate	US	\N	\N	Austin	\N	\N	{}	2026-04-10 12:57:14.930737	2026-04-10 12:57:14.930737	deal-assets/images_a1f68665-9d3c-445a-b0c3-ca8473f15f48_1775806166679.jpg;deal-assets/images_31408dfe-292d-4aca-b42b-b59f37cfa911_1775806169936.jpg	29bd6082-f505-4a8e-acd5-1fe082ce6c2a
4b3b6017-d496-4985-83c4-9c603bd7135e	Urban Growth Investment	exchange_1031	liquidated	506_b	2027-12-10	Urban Growth Investment	f	t	Oakwood Residential Estate	US	\N	\N	Chicago	\N	\N	{}	2026-04-10 16:52:24.17166	2026-04-10 16:52:24.17166	\N	29bd6082-f505-4a8e-acd5-1fe082ce6c2a
\.


--
-- TOC entry 5012 (class 0 OID 58569)
-- Dependencies: 221
-- Data for Name: assigning_deal_user; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.assigning_deal_user (deal_id, user_id, user_added_deal) FROM stdin;
f0a1e931-6d93-4c29-b06c-81bf4c949fac	ecb3e27e-0767-4fc6-9757-4f9fb304792d	1b9ee6e9-523c-4052-ad33-e576e045ec43
4b3b6017-d496-4985-83c4-9c603bd7135e	ecb3e27e-0767-4fc6-9757-4f9fb304792d	1b9ee6e9-523c-4052-ad33-e576e045ec43
\.


--
-- TOC entry 5013 (class 0 OID 58572)
-- Dependencies: 222
-- Data for Name: companies; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.companies (id, name, created_at, updated_at, status) FROM stdin;
29bd6082-f505-4a8e-acd5-1fe082ce6c2a	NextGen Innovations	2026-04-10 12:51:35.779093+05:30	2026-04-10 12:51:35.779093+05:30	active
be13cca6-a8f7-451f-b8b0-4a7ede064d00	SilverPeak Solutions	2026-04-10 14:04:16.696774+05:30	2026-04-10 14:04:16.696774+05:30	active
\.


--
-- TOC entry 5014 (class 0 OID 58579)
-- Dependencies: 223
-- Data for Name: company_admin_audit_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.company_admin_audit_logs (id, actor_user_id, target_company_id, action, reason, changes_json, created_at) FROM stdin;
\.


--
-- TOC entry 5015 (class 0 OID 58586)
-- Dependencies: 224
-- Data for Name: company_workspace_tab_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.company_workspace_tab_settings (company_id, tab_key, payload, updated_at) FROM stdin;
\.


--
-- TOC entry 5016 (class 0 OID 58593)
-- Dependencies: 225
-- Data for Name: contact; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.contact (id, first_name, last_name, email, phone, note, tags, lists, owners, created_by, created_at, status, last_edit_reason) FROM stdin;
671e910b-206e-4e4c-ad5b-149b93b0a313	lucas	baker	lucas.baker@gmail.com	14155550162		[]	[]	["Ethan Adams"]	1b9ee6e9-523c-4052-ad33-e576e045ec43	2026-04-10 12:56:51.405281+05:30	active	\N
33f284f9-2fc8-4628-bdb2-b649876e3b65	Mia	Nelson	mia.nelson@gmail.com	1415555019		[]	[]	["Noah scott"]	92bd4606-4681-40c7-8b96-63c65152743e	2026-04-10 14:47:51.410872+05:30	active	\N
19c11c89-c985-4c43-b153-2be18d6bebc3	charlotte	perez	charlotte.perez@gmail.com	6767576576		[]	[]	["Ethan Adams"]	1b9ee6e9-523c-4052-ad33-e576e045ec43	2026-04-10 15:11:36.761187+05:30	active	\N
\.


--
-- TOC entry 5017 (class 0 OID 58606)
-- Dependencies: 226
-- Data for Name: deal_investment; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.deal_investment (id, deal_id, offering_id, contact_id, profile_id, status, investor_class, doc_signed_date, commitment_amount, extra_contribution_amounts, document_storage_path, created_at, contact_display_name, investor_role) FROM stdin;
fec05211-9045-44a2-a9e5-9f2e802d3a2e	f0a1e931-6d93-4c29-b06c-81bf4c949fac	primary	ecb3e27e-0767-4fc6-9757-4f9fb304792d	individual	Draft (hidden to investors)	General Partners	2026-04-30	$90,000	[]	\N	2026-04-10 16:48:45.753764+05:30	michael reed	Lead Sponsor
\.


--
-- TOC entry 5018 (class 0 OID 58622)
-- Dependencies: 227
-- Data for Name: deal_investor_class; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.deal_investor_class (id, deal_id, name, subscription_type, entity_name, start_date, offering_size, minimum_investment, price_per_unit, status, visibility, created_at, updated_at, raise_amount_distributions, billing_raise_quota, advanced_options_json) FROM stdin;
9d6a3290-320d-46d0-a15d-a649e0f7147b	f0a1e931-6d93-4c29-b06c-81bf4c949fac	General Partners	lp		2027-01-31	$12,000	$5,000		closed		2026-04-10 13:06:13.307178+05:30	2026-04-10 13:06:13.307178+05:30	$1,234		{"investmentType":"equity","classPreferredReturnType":"","entityLegalOwnershipPct":"10","entityLegalOwnershipFrozen":false,"distributionSharePct":"0%","distributionShareFrozen":false,"maximumInvestment":"$560,000","targetIrr":"","assetTags":["All"],"waitlistStatus":"off","hurdles":[]}
8ea44159-400b-44da-8a56-9c4f5164b183	c5799006-3016-4a09-b74f-130f59751d92	General Partners	lp		2027-04-30	$120,001	$50,000		closed		2026-04-10 14:46:44.327771+05:30	2026-04-10 14:46:44.327771+05:30	$1,234		{"investmentType":"equity","classPreferredReturnType":"","entityLegalOwnershipPct":"10%","entityLegalOwnershipFrozen":false,"distributionSharePct":"0%","distributionShareFrozen":false,"maximumInvestment":"","targetIrr":"","assetTags":["All"],"waitlistStatus":"off","hurdles":[]}
8ebd0698-3b31-4472-801f-d1bffac30dff	4b3b6017-d496-4985-83c4-9c603bd7135e	Class A - Limited Partners	lp		2026-04-30	$12,000	$50,000		closed		2026-04-10 16:54:22.226175+05:30	2026-04-10 16:54:22.226175+05:30	$1,000		{"investmentType":"equity","classPreferredReturnType":"","entityLegalOwnershipPct":"10","entityLegalOwnershipFrozen":false,"distributionSharePct":"0%","distributionShareFrozen":false,"maximumInvestment":"","targetIrr":"","assetTags":["All"],"waitlistStatus":"off","hurdles":[]}
\.


--
-- TOC entry 5022 (class 0 OID 59093)
-- Dependencies: 231
-- Data for Name: deal_lp_investor; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.deal_lp_investor (id, deal_id, added_by, contact_member_id, investor_class, send_invitation_mail, created_at, updated_at) FROM stdin;
506a050d-b18b-4720-96fc-991280cef5cb	f0a1e931-6d93-4c29-b06c-81bf4c949fac	1b9ee6e9-523c-4052-ad33-e576e045ec43	671e910b-206e-4e4c-ad5b-149b93b0a313	General Partners	yes	2026-04-10 14:59:18.309076+05:30	2026-04-10 14:59:19.809+05:30
\.


--
-- TOC entry 5021 (class 0 OID 58900)
-- Dependencies: 230
-- Data for Name: deal_member; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.deal_member (id, deal_id, send_invitation_mail, created_at, updated_at, added_by, contact_member_id, deal_member_role) FROM stdin;
269b6239-1b11-4c08-94e3-47294eb0933b	f0a1e931-6d93-4c29-b06c-81bf4c949fac	yes	2026-04-10 16:48:45.75956+05:30	2026-04-10 16:48:54.798+05:30	1b9ee6e9-523c-4052-ad33-e576e045ec43	ecb3e27e-0767-4fc6-9757-4f9fb304792d	Lead Sponsor
\.


--
-- TOC entry 5019 (class 0 OID 58647)
-- Dependencies: 228
-- Data for Name: member_admin_audit_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.member_admin_audit_logs (id, actor_user_id, target_user_id, action, reason, changes_json, created_at) FROM stdin;
\.


--
-- TOC entry 5020 (class 0 OID 58654)
-- Dependencies: 229
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, email, username, password_hash, role, user_status, user_signup_completed, organization_id, first_name, last_name, phone, created_at, updated_at, company_name, invite_expires_at) FROM stdin;
b2c15cb6-1678-4819-9d24-6fdd8d192064	platform.admin@example.com	platformadmin	$2b$10$i6AuCoVjx3XxI32s8hRia.d1flK87VWianJ2VFr5l7Mloa1sTPeMe	platform_admin	active	true	\N	Platform	Admin		2026-03-28 19:32:33.541251+05:30	2026-03-28 19:32:33.541251+05:30	Massive Capital	\N
6993b7b5-0e2d-4fc5-94ad-9c89fa8a300a	alexa@companya.com	Alexa	$2b$10$Yz1uYN62mriBlSFTE3pwZeLRmrIZAA6dZVbiyfWSkKCZkL51yTVZu	company_admin	active	true	4f5a59b3-ccc5-4a09-a6ee-e556a40e8baf	Alexa	A	1234567890	2026-04-04 12:25:05.585123+05:30	2026-04-04 12:27:36.093+05:30	Company A	\N
952a1c23-81de-49f6-b832-c13b6a290292	john@gmail.com	john	$2b$10$LowWzg7M70fWWbWvyZjciu40iJo4xwyQGmcYi67MOu2XMOCVO8zDK	company_admin	active	true	2184b366-d579-4cb2-bb8a-41309045bee7	john	doe	12345678	2026-04-04 13:27:47.056012+05:30	2026-04-04 13:30:58.541+05:30	Company B	\N
8708a912-7c8a-4f16-8e0f-c0f783f1ee77	one@companyc.com	User-One	$2b$10$6cNV4TzaWjWrkGLNOo4tVOwKCMwCoOr4udWVgXQXLm8DcCE0UH/NC	company_admin	active	true	4cb97691-89fd-4330-8661-9d3ef94c870e	User	C	1212121212	2026-04-04 16:40:29.130176+05:30	2026-04-04 16:41:32.304+05:30	Company C	\N
f292fc78-e5fa-44a2-b3b3-0d18d4fd8f56	testing01@gmail.com	invited_8547e3b09401dc37198a4dda	$2b$10$MnzGArfd12zNaGCGwT./nu/uJuezUMwqhqtsmn3kxGUf4QeQFZ9lW	company_admin	active	false	2184b366-d579-4cb2-bb8a-41309045bee7				2026-04-04 20:41:53.52217+05:30	2026-04-04 20:41:53.52217+05:30	Company B	2026-04-11 20:41:53+05:30
d6a90f47-5798-450a-ae4b-285254771c51	user@companyd.com	UserD	$2b$10$RqbCu/JdmXjsRALGSpPyQ.bH4DW1DvBB4cOpEc4YMpXv.BFlupLgC	company_admin	active	true	2cbf5727-346d-48e7-9b9d-e982e62d0170	User	D	9876987601	2026-04-06 08:37:39.802433+05:30	2026-04-06 08:38:31.244+05:30	Company D	\N
a6eb626e-a2da-463a-8955-029a96199cc6	checking.q@gmail.com	Olive	$2b$10$VkTjGDO9SpnbsQCFwCXEb.HPJ02XD.k64IH3HmDPqvPnsNap1g6P2	company_admin	active	true	57bd4602-c54d-48db-a19c-6289226fc4d1	Olive	Twister	8999457681	2026-04-09 22:37:17.415894+05:30	2026-04-09 22:39:41.556+05:30	Company Q	\N
1b9ee6e9-523c-4052-ad33-e576e045ec43	ethan.adams@demo.com	Ethan Adams	$2b$10$2iVHiRaBeQwQfGlurAH/Yu9dV1OtcoL.IsNY5m8lFccGbHDbEhf1e	company_admin	active	true	29bd6082-f505-4a8e-acd5-1fe082ce6c2a	Ethan	Adams	14155550174	2026-04-10 12:52:30.69208+05:30	2026-04-10 12:54:07.885+05:30	NextGen Innovations	\N
ecb3e27e-0767-4fc6-9757-4f9fb304792d	michael.reed@gmail.com	michael	$2b$10$6GOPVlDW88ulMGoMIr5e0uCb8MdjhdLZKOKcyJ3yzu7x5i8jupouW	platform_user	active	true	29bd6082-f505-4a8e-acd5-1fe082ce6c2a	michael	reed	12025550192	2026-04-10 13:00:56.035473+05:30	2026-04-10 13:02:51.604+05:30	NextGen Innovations	\N
92bd4606-4681-40c7-8b96-63c65152743e	noah.scott@demo.com	Noah	$2b$10$rhj53QqvPO.xVeBkeFDK4uN6qRE3ZXPIY1r/ZNxIHCcP7RMVcI8XO	company_admin	active	true	be13cca6-a8f7-451f-b8b0-4a7ede064d00	Noah	scott	13035550167	2026-04-10 14:04:59.797995+05:30	2026-04-10 14:05:58.597+05:30	SilverPeak Solutions	\N
\.


--
-- TOC entry 5029 (class 0 OID 0)
-- Dependencies: 219
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE SET; Schema: drizzle; Owner: postgres
--

SELECT pg_catalog.setval('drizzle.__drizzle_migrations_id_seq', 5, true);


--
-- TOC entry 4817 (class 2606 OID 58671)
-- Name: __drizzle_migrations __drizzle_migrations_pkey; Type: CONSTRAINT; Schema: drizzle; Owner: postgres
--

ALTER TABLE ONLY drizzle.__drizzle_migrations
    ADD CONSTRAINT __drizzle_migrations_pkey PRIMARY KEY (id);


--
-- TOC entry 4819 (class 2606 OID 58673)
-- Name: add_deal_form add_deal_form_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.add_deal_form
    ADD CONSTRAINT add_deal_form_pkey PRIMARY KEY (id);


--
-- TOC entry 4821 (class 2606 OID 58675)
-- Name: assigning_deal_user assigning_deal_user_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assigning_deal_user
    ADD CONSTRAINT assigning_deal_user_pkey PRIMARY KEY (deal_id, user_id);


--
-- TOC entry 4823 (class 2606 OID 58677)
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- TOC entry 4825 (class 2606 OID 58679)
-- Name: company_admin_audit_logs company_admin_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.company_admin_audit_logs
    ADD CONSTRAINT company_admin_audit_logs_pkey PRIMARY KEY (id);


--
-- TOC entry 4827 (class 2606 OID 58681)
-- Name: company_workspace_tab_settings company_workspace_tab_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.company_workspace_tab_settings
    ADD CONSTRAINT company_workspace_tab_settings_pkey PRIMARY KEY (company_id, tab_key);


--
-- TOC entry 4829 (class 2606 OID 58683)
-- Name: contact contact_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contact
    ADD CONSTRAINT contact_pkey PRIMARY KEY (id);


--
-- TOC entry 4831 (class 2606 OID 58685)
-- Name: deal_investment deal_investment_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deal_investment
    ADD CONSTRAINT deal_investment_pkey PRIMARY KEY (id);


--
-- TOC entry 4833 (class 2606 OID 58687)
-- Name: deal_investor_class deal_investor_class_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deal_investor_class
    ADD CONSTRAINT deal_investor_class_pkey PRIMARY KEY (id);


--
-- TOC entry 4847 (class 2606 OID 59105)
-- Name: deal_lp_investor deal_lp_investor_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deal_lp_investor
    ADD CONSTRAINT deal_lp_investor_pkey PRIMARY KEY (id);


--
-- TOC entry 4844 (class 2606 OID 58917)
-- Name: deal_member deal_member_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deal_member
    ADD CONSTRAINT deal_member_pkey PRIMARY KEY (id);


--
-- TOC entry 4835 (class 2606 OID 58691)
-- Name: member_admin_audit_logs member_admin_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_admin_audit_logs
    ADD CONSTRAINT member_admin_audit_logs_pkey PRIMARY KEY (id);


--
-- TOC entry 4837 (class 2606 OID 58693)
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- TOC entry 4839 (class 2606 OID 58695)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 4841 (class 2606 OID 58697)
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- TOC entry 4845 (class 1259 OID 59116)
-- Name: deal_lp_investor_deal_id_contact_member_id_uidx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX deal_lp_investor_deal_id_contact_member_id_uidx ON public.deal_lp_investor USING btree (deal_id, contact_member_id);


--
-- TOC entry 4842 (class 1259 OID 59003)
-- Name: deal_member_deal_id_contact_member_id_uidx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX deal_member_deal_id_contact_member_id_uidx ON public.deal_member USING btree (deal_id, contact_member_id);


--
-- TOC entry 4848 (class 2606 OID 58698)
-- Name: add_deal_form add_deal_form_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.add_deal_form
    ADD CONSTRAINT add_deal_form_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.companies(id) ON DELETE SET NULL;


--
-- TOC entry 4849 (class 2606 OID 58703)
-- Name: assigning_deal_user assigning_deal_user_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assigning_deal_user
    ADD CONSTRAINT assigning_deal_user_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.add_deal_form(id) ON DELETE CASCADE;


--
-- TOC entry 4850 (class 2606 OID 58708)
-- Name: assigning_deal_user assigning_deal_user_user_added_deal_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assigning_deal_user
    ADD CONSTRAINT assigning_deal_user_user_added_deal_fkey FOREIGN KEY (user_added_deal) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- TOC entry 4851 (class 2606 OID 58713)
-- Name: assigning_deal_user assigning_deal_user_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assigning_deal_user
    ADD CONSTRAINT assigning_deal_user_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 4852 (class 2606 OID 58718)
-- Name: company_admin_audit_logs company_admin_audit_logs_actor_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.company_admin_audit_logs
    ADD CONSTRAINT company_admin_audit_logs_actor_user_id_users_id_fk FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- TOC entry 4853 (class 2606 OID 58723)
-- Name: company_admin_audit_logs company_admin_audit_logs_target_company_id_companies_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.company_admin_audit_logs
    ADD CONSTRAINT company_admin_audit_logs_target_company_id_companies_id_fk FOREIGN KEY (target_company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- TOC entry 4854 (class 2606 OID 58728)
-- Name: company_workspace_tab_settings company_workspace_tab_settings_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.company_workspace_tab_settings
    ADD CONSTRAINT company_workspace_tab_settings_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- TOC entry 4855 (class 2606 OID 58733)
-- Name: contact contact_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contact
    ADD CONSTRAINT contact_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- TOC entry 4856 (class 2606 OID 58738)
-- Name: deal_investment deal_investment_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deal_investment
    ADD CONSTRAINT deal_investment_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.add_deal_form(id) ON DELETE CASCADE;


--
-- TOC entry 4857 (class 2606 OID 58743)
-- Name: deal_investor_class deal_investor_class_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deal_investor_class
    ADD CONSTRAINT deal_investor_class_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.add_deal_form(id) ON DELETE CASCADE;


--
-- TOC entry 4862 (class 2606 OID 59111)
-- Name: deal_lp_investor deal_lp_investor_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deal_lp_investor
    ADD CONSTRAINT deal_lp_investor_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- TOC entry 4863 (class 2606 OID 59106)
-- Name: deal_lp_investor deal_lp_investor_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deal_lp_investor
    ADD CONSTRAINT deal_lp_investor_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.add_deal_form(id) ON DELETE CASCADE;


--
-- TOC entry 4860 (class 2606 OID 58998)
-- Name: deal_member deal_member_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deal_member
    ADD CONSTRAINT deal_member_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- TOC entry 4861 (class 2606 OID 58918)
-- Name: deal_member deal_member_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deal_member
    ADD CONSTRAINT deal_member_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.add_deal_form(id) ON DELETE CASCADE;


--
-- TOC entry 4858 (class 2606 OID 58753)
-- Name: member_admin_audit_logs member_admin_audit_logs_actor_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_admin_audit_logs
    ADD CONSTRAINT member_admin_audit_logs_actor_user_id_users_id_fk FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- TOC entry 4859 (class 2606 OID 58758)
-- Name: member_admin_audit_logs member_admin_audit_logs_target_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_admin_audit_logs
    ADD CONSTRAINT member_admin_audit_logs_target_user_id_users_id_fk FOREIGN KEY (target_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


-- Completed on 2026-04-10 17:04:47

--
-- PostgreSQL database dump complete
--

\unrestrict Cm0ayffbWP7iKoisJG8wOY7rkgGopt48mWj1sVjkKk9PKA7wtVk4ZwvfZdEiaTl

