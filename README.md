# Chicken Products Center

Online shop for young chicks, eggs, mature chickens and chicken feeds. Customers have accounts, and their email, phone and delivery address are checked before an order is placed.

## Tech
- Vite + TypeScript frontend (`index.html`, `src/`), hash-based routing
- Hono API running as a Netlify Server (`netlify/server/index.ts`)
- Netlify Database (Postgres) with Drizzle ORM (`db/`, migrations in `netlify/database/migrations/`)
- Netlify Identity for customer accounts, Netlify Blobs for product photos
- Optional: Resend (email codes) and Twilio (SMS codes)

## Run locally
Requires Node 24.
```
npm install
netlify dev --port 8889
```

## Environment variables (optional)
`RESEND_API_KEY`, `EMAIL_FROM`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`. In local dev and deploy previews, codes appear on screen when these aren't set.

## Roadmap
See PLAN.md.
