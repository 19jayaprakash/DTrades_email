# D Trades International — Email Outreach CRM

A multi-account email outreach CRM for D Trades International (GSTIN: 33GJCPD2009H1ZT). Supports role-based login, template management, bulk email sending via SMTP with automatic attachments, and an admin dashboard with full analytics.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, served at /api)
- `pnpm --filter @workspace/email-crm run dev` — run the frontend (served at /)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string, `SESSION_SECRET` — JWT signing secret

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS + shadcn/ui + Recharts
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Auth: JWT (bcryptjs + jsonwebtoken), role-based (admin/user)
- Email: Nodemailer (Google Workspace SMTP / any SMTP)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — API contract (source of truth)
- `lib/db/src/schema/` — DB tables: users, accounts, templates, email_logs
- `artifacts/api-server/src/routes/` — auth, users, accounts, templates, emails, dashboard
- `artifacts/api-server/src/lib/auth.ts` — JWT sign/verify, requireAuth/requireAdmin middleware
- `artifacts/email-crm/src/` — React frontend
- `artifacts/email-crm/src/contexts/AuthContext.tsx` — auth state management
- `artifacts/email-crm/src/lib/api.ts` — sets up setAuthTokenGetter for JWT injection

## Architecture decisions

- JWT stored in localStorage as `auth_token`; injected via `setAuthTokenGetter` from `@workspace/api-client-react`
- Email sending is async (responds immediately, sends in background via `setImmediate`)
- Delay between sends configurable per-campaign to avoid spam filters
- Error types classified: smtp_failed, invalid_email, blocked, limit_reached, auth_error
- SMTP passwords stored in DB (plaintext) — use env vars or vault in production

## Product

- **Login**: Role-based login (admin / team user)
- **Dashboard** (admin): Stats cards, per-account breakdown, 30-day activity chart, error widget
- **Compose**: Paste email list (auto-detects Name,email format), select account + template, set delay, send
- **History**: Paginated table of all sends with retry for failed
- **Templates** (admin): Rich HTML editor with live preview, dynamic variables ({{name}}, etc.)
- **Accounts** (admin): SMTP sender accounts with daily limit tracking
- **Users** (admin): Team management with role/region assignment
- **Errors** (admin): Error log with retry capability

## Seed Credentials

- Admin: `admin@mailflow.io` / `admin123`
- USA Team: `usa@mailflow.io` / `usa123`
- UK Team: `uk@mailflow.io` / `uk123`
- India Team: `india@mailflow.io` / `india123`

## User preferences

- Light theme only
- Attractive, information-dense design

## Gotchas

- SMTP passwords are stored in DB — rotate regularly in production
- The `SESSION_SECRET` env var must be set for JWT signing (falls back to dev secret)
- `setAuthTokenGetter` (not `setCustomFetch`) is the correct API from `@workspace/api-client-react`
- After any OpenAPI spec change, run codegen before using updated types

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
