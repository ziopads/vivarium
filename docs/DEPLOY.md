# Vivarium — Deployment Runbook (Supabase + Vercel)

Living checklist for taking Vivarium live. Do the steps in order; the phases
marked **(you)** need your accounts/secrets, **(code)** are things I build.

---

## Phase 1 — Database foundation ✅ ready now

1. **(you)** Create a **Supabase** project (choose a US region). From
   *Project Settings → API* copy: the **Project URL**, the **anon key**, and the
   **service-role key**. From *Database → Connect* copy the **pooled** connection
   string (port 6543).
2. **(you)** In the Supabase **SQL editor**, run `supabase/schema.sql`.
3. **(you)** Locally, install the client and seed the data:
   ```bash
   npm i @supabase/supabase-js @supabase/ssr
   # put the values in .env.local (see .env.example)
   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-to-supabase.mjs
   ```
   This copies all items + the vocabulary into Postgres. It's idempotent.
4. **(you)** Paste the four Supabase values back to me (URL, anon key,
   service-role key, pooled DB URL) so I can wire and test the app against them.

## Phase 2 — App reads/writes from Supabase **(code, next)**

- Rewrite `lib/data.ts` to read/write from Supabase when configured, else fall
  back to the local JSON files (so local dev keeps working with no database).
  Map row → `Item` (merge the typed columns with the `attributes` bag) on read,
  and split `Item` → columns + `attributes` on write.
- Add a per-type validation schema (Zod) run at the write boundary — this is
  what enforces standardization on the flexible JSONB tail.
- Refactor the mutating routes (`meta`, `bulk-section`, `vocab`, `delete`,
  `visibility`, `cover`, `copyright`) to write to Postgres.
- Bake the image list into each record (no runtime folder scan — that doesn't
  work on Vercel's read-only filesystem).

## Phase 3 — Auth + access control **(code, next)**

- Supabase Auth with **magic-link email** (Google optional later).
- Enforce `AUTH_ALLOWLIST` (who may sign in) and `AUTH_ADMINS` (who may edit) in
  middleware.
- A session guard at the top of **every** mutating route; delete gated to admin.
- Enforce `visibility: restricted` server-side (filter those items out for
  anyone not authorized) — not just the badge it is today.

## Phase 4 — Images **(decision + code)**

Decision to make: serve/upload images from **Supabase Storage** (one vendor) vs
**Cloudflare R2** (cheaper egress). For Vivarium's ~1–3 GB, Supabase Storage is
simplest. Then a one-time script uploads `public/items/**` to Storage and
rewrites each record's image paths to the Storage URLs. In-app upload UI is a
fast-follow that finally retires the local image script.

## Phase 5 — Ship on Vercel **(you + code)**

1. **(you)** Import the repo into **Vercel**; add all env vars from `.env.example`.
2. **(you)** In Supabase Auth settings, add the Vercel URL to the allowed
   redirect URLs, and enable the Email provider.
3. **(you)** Deploy; attach a domain.
4. Confirm an edit persists across a redeploy (proves you're on the DB, not the
   ephemeral filesystem).

---

## Backups (once live)

- **Structured data:** a scheduled dump of the `items` + `vocab` tables to a
  private git repo (free, versioned, trivial rollback) — plus Supabase's own
  automated backups on Pro.
- **Images:** nightly sync of the Storage bucket to R2 or Backblaze B2.
- Test a restore once so you know it works.
