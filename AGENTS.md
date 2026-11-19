# Agent notes

- Frontend: `src/main.ts` (router), `shop.ts`, `account.ts`, `checkout.ts`, `admin.ts`, `lib.ts` (API helper, cart, money), `art.ts` (SVG illustrations), `styles.css`.
- Backend: one Netlify Server entry `netlify/server/index.ts` (Hono, all `/api/*` routes). Helpers live in `server/` (auth, validation, notifications, store settings).
- Server code runs under Node's TypeScript strip-only mode: don't use parameter properties, enums or namespaces in `server/`, `db/` or `netlify/`.
- Schema: `db/schema.ts`. Change it, then run `npx drizzle-kit generate --name <name>`. Never edit applied migrations.
- Auth: the server checks the `nf_jwt` cookie or Bearer token against `/.netlify/identity/user`. Admin = `admin` role in app_metadata.
- Orders start as `awaiting_verification` and become `placed` only after the email and phone codes are verified (or are flagged `manual_check_required` in production when no provider is configured). Prices and stock always come from the server.
- Next steps are listed in PLAN.md.
