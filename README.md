# Doit

## Deploy on Vercel

This repository contains the web app in `web/`.

For Vercel:

1. Import the repository into Vercel.
2. Set the project `Root Directory` to `web`.
3. Framework preset: `Next.js`.
4. Install command: `npm install`.
5. Build command: `npm run build`.

Required environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NOTIFICATION_OUTBOX_CRON_SECRET` or `CRON_SECRET`
- `RESEND_API_KEY`
- `NOTIFICATION_EMAIL_FROM`

Notes:

- Example values are documented in `web/.env.local.example`.
- Vercel cron is configured in `web/vercel.json` and calls `/api/cron/process-notification-outbox` every 5 minutes.
- Supabase SQL migrations are not applied by Vercel automatically. Run them separately against your Supabase database before production use.
