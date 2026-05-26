--
-- PostgreSQL database dump
--

\restrict 1e6KjzKIQdgGRhvVamL2ohv2Njp8BZkkliIgaQ7eRGzmedJdP25LVgBVP2bQSgU

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: email_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.email_status AS ENUM (
    'sent',
    'failed',
    'pending'
);


ALTER TYPE public.email_status OWNER TO postgres;

--
-- Name: error_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.error_type AS ENUM (
    'smtp_failed',
    'invalid_email',
    'blocked',
    'limit_reached',
    'auth_error',
    'unknown'
);


ALTER TYPE public.error_type OWNER TO postgres;

--
-- Name: user_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.user_role AS ENUM (
    'admin',
    'user'
);


ALTER TYPE public.user_role OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: accounts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.accounts (
    id integer NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    region text NOT NULL,
    smtp_host text NOT NULL,
    smtp_port integer DEFAULT 587 NOT NULL,
    smtp_user text NOT NULL,
    smtp_pass text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    daily_limit integer DEFAULT 500 NOT NULL,
    sent_today integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.accounts OWNER TO postgres;

--
-- Name: accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.accounts_id_seq OWNER TO postgres;

--
-- Name: accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.accounts_id_seq OWNED BY public.accounts.id;


--
-- Name: attachments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.attachments (
    id integer NOT NULL,
    name text NOT NULL,
    filename text NOT NULL,
    mime_type text DEFAULT 'application/pdf'::text NOT NULL,
    content text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    user_id integer NOT NULL
);


ALTER TABLE public.attachments OWNER TO postgres;

--
-- Name: attachments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.attachments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.attachments_id_seq OWNER TO postgres;

--
-- Name: attachments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.attachments_id_seq OWNED BY public.attachments.id;


--
-- Name: email_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.email_logs (
    id integer NOT NULL,
    account_id integer NOT NULL,
    template_id integer,
    recipient_email text NOT NULL,
    recipient_name text,
    subject text NOT NULL,
    status public.email_status DEFAULT 'pending'::public.email_status NOT NULL,
    error_type public.error_type,
    error_message text,
    sent_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.email_logs OWNER TO postgres;

--
-- Name: email_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.email_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.email_logs_id_seq OWNER TO postgres;

--
-- Name: email_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.email_logs_id_seq OWNED BY public.email_logs.id;


--
-- Name: templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.templates (
    id integer NOT NULL,
    name text NOT NULL,
    subject text NOT NULL,
    html_content text NOT NULL,
    text_content text,
    category text,
    variables text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.templates OWNER TO postgres;

--
-- Name: templates_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.templates_id_seq OWNER TO postgres;

--
-- Name: templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.templates_id_seq OWNED BY public.templates.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    email text NOT NULL,
    name text NOT NULL,
    password_hash text NOT NULL,
    role public.user_role DEFAULT 'user'::public.user_role NOT NULL,
    region text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: accounts id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accounts ALTER COLUMN id SET DEFAULT nextval('public.accounts_id_seq'::regclass);


--
-- Name: attachments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attachments ALTER COLUMN id SET DEFAULT nextval('public.attachments_id_seq'::regclass);


--
-- Name: email_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_logs ALTER COLUMN id SET DEFAULT nextval('public.email_logs_id_seq'::regclass);


--
-- Name: templates id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.templates ALTER COLUMN id SET DEFAULT nextval('public.templates_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: accounts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.accounts (id, name, email, region, smtp_host, smtp_port, smtp_user, smtp_pass, is_active, daily_limit, sent_today, created_at) FROM stdin;
1	USA Team	usa@mailflow.io	USA	smtp.gmail.com	587	usa@mailflow.io	placeholder_pass	t	500	128	2026-05-26 07:16:27.143279
2	UK Team	uk@mailflow.io	UK	smtp.gmail.com	587	uk@mailflow.io	placeholder_pass	t	500	94	2026-05-26 07:16:27.143279
3	India Team	india@mailflow.io	India	smtp.gmail.com	587	india@mailflow.io	placeholder_pass	t	500	67	2026-05-26 07:16:27.143279
4	UAE Team	uae@mailflow.io	UAE	smtp.gmail.com	587	uae@mailflow.io	placeholder_pass	t	300	45	2026-05-26 07:16:27.143279
5	Australia Team	au@mailflow.io	Australia	smtp.gmail.com	587	au@mailflow.io	placeholder_pass	t	300	32	2026-05-26 07:16:27.143279
\.


--
-- Data for Name: attachments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.attachments (id, name, filename, mime_type, content, is_active, created_at, user_id) FROM stdin;
\.


--
-- Data for Name: email_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.email_logs (id, account_id, template_id, recipient_email, recipient_name, subject, status, error_type, error_message, sent_at, created_at) FROM stdin;
\.


--
-- Data for Name: templates; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.templates (id, name, subject, html_content, text_content, category, variables, created_at, updated_at) FROM stdin;
5	D Trades International – Introduction	Premium A-Grade Spices & Food Ingredients from India | D Trades International	<!DOCTYPE html>\n  <html>\n  <head><meta charset="utf-8"><style>\n    body { font-family: Arial, sans-serif; font-size: 14px; color: #2d2d2d; line-height: 1.7; }\n    .container { max-width: 680px; margin: 0 auto; padding: 0 16px; }\n    p { margin: 0 0 14px; }\n    ul { margin: 8px 0 14px 0; padding-left: 24px; }\n    li { margin-bottom: 6px; }\n    a { color: #c47a1b; }\n  </style></head>\n  <body><div class="container">\n  <p>Dear {{name}},</p>\n  <p>Greetings from D Trades International.</p>\n  <p>I hope you are doing well. I am reaching out to introduce our export-import business, D Trades International (GSTIN: 33GJCPD2009H1ZT), specializing in premium A-grade spices, food ingredients, and specialty products sourced directly from trusted farmers and producers across India.</p>\n  <p>One of our key strengths is offering export-quality products at highly competitive and market-friendly wholesale pricing without compromising on freshness or consistency. By sourcing directly from farmers and producers, we ensure better quality control, authentic flavour, and fair trade practices that support farming communities at the grassroots level.</p>\n  <p>We understand how important consistency, aroma, and freshness are for restaurants and food businesses. To maintain the highest standards, we also provide lab test certificates for bulk orders, ensuring complete transparency and quality assurance.</p>\n  <p><strong>Our product range includes:</strong></p>\n  <ul>\n    <li>Whole spices - cardamom, cinnamon, cloves, pepper, and more</li>\n    <li>Chilli varieties and spice powders (mild to hot)</li>\n    <li>Rice, lentils, and pulses</li>\n    <li>Nuts and dry fruits</li>\n    <li>Coffee (Arabica and Robusta blends)</li>\n    <li>Specialty products such as saffron, Grade A gourmet vanilla beans, honey, and jaggery</li>\n    <li>Traditional sun-dried products (vathal, vadam, appalam)</li>\n  </ul>\n  <p>We cater to both regular and bulk supply requirements for restaurants, wholesalers, retailers, distributors, and ethnic grocery businesses.</p>\n  <p>We would be delighted if you could take a moment to explore our catalogue and learn more about our offerings through our website, <a href="https://Dtradesinternational.in">Dtradesinternational.in</a>, or by reviewing the catalogue attached to this email.</p>\n  <p><strong>Kindly note the following:</strong></p>\n  <ul>\n    <li>Orders typically start from 20 kg onwards, depending on product type and destination country.</li>\n    <li>Samples can be arranged upon request for quality evaluation before bulk orders.</li>\n    <li>We currently provide air shipment only (Economy and Express options available).</li>\n    <li>Product prices in the catalogue do not include shipping charges.</li>\n    <li>Prices are subject to market fluctuations and seasonal availability.</li>\n    <li>No separate packing charges will be applied.</li>\n    <li>Customs duties, import taxes, VAT/GST, and destination country charges shall be borne by the buyer.</li>\n    <li>For further details, kindly refer to the attached Terms and Conditions document.</li>\n  </ul>\n  <p>We would truly appreciate the opportunity to work with your business and would be happy to arrange samples or connect over a Google Meet call at your convenience.</p>\n  <p>Looking forward to your response and hoping to build a long-term association.</p>\n  </div></body></html>	Dear {{name}}, Greetings from D Trades International...	Outreach	{name}	2026-05-26 07:40:39.697884	2026-05-26 07:40:39.697884
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, email, name, password_hash, role, region, is_active, created_at) FROM stdin;
1	admin@gmail.com	Admin User	$2b$10$LMb8e39oHfiMgoxEbtyilOIHf1VRzxzuDhx9eIO/ryWNhKekWJa1K	admin	\N	t	2026-05-26 07:24:12.529714
2	usa@gmail.com	USA Team	$2b$10$3/FeMgyRjpsfa76dEdlSc.thxCGrsP8PC7PJ2JWezLJ2mFrwd2yRG	user	USA	t	2026-05-26 07:24:12.529714
3	uk@mailflow.io	UK Team	$2b$10$tm4BVqIS8tVSgObsysOp6uzJ2t6fN1nqNVW7N0QEqBQRTTy0hhZBC	user	UK	t	2026-05-26 07:24:12.529714
4	india@mailflow.io	India Team	$2b$10$9huqOlunMahxi.t8YbhSy.PzIxUOM6.VwJAXUnPqsaWFOOnS/OSSi	user	India	t	2026-05-26 07:24:12.529714
\.


--
-- Name: accounts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.accounts_id_seq', 5, true);


--
-- Name: attachments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.attachments_id_seq', 1, false);


--
-- Name: email_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.email_logs_id_seq', 1, false);


--
-- Name: templates_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.templates_id_seq', 5, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_id_seq', 4, true);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: attachments attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_pkey PRIMARY KEY (id);


--
-- Name: email_logs email_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_logs
    ADD CONSTRAINT email_logs_pkey PRIMARY KEY (id);


--
-- Name: templates templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.templates
    ADD CONSTRAINT templates_pkey PRIMARY KEY (id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: attachments attachments_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: email_logs email_logs_account_id_accounts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_logs
    ADD CONSTRAINT email_logs_account_id_accounts_id_fk FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: email_logs email_logs_template_id_templates_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_logs
    ADD CONSTRAINT email_logs_template_id_templates_id_fk FOREIGN KEY (template_id) REFERENCES public.templates(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict 1e6KjzKIQdgGRhvVamL2ohv2Njp8BZkkliIgaQ7eRGzmedJdP25LVgBVP2bQSgU

