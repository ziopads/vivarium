# Standing up a new Vivarium instance

An instance is one deployment of this codebase against its own Supabase project,
its own images, and its own identity. It is CONFIG, NOT A FORK. Every instance
runs the same `main`; what differs is an entry in `lib/instance.ts`, a theme
block in `app/globals.css`, and a set of environment variables. If you find
yourself wanting a code branch for one instance, that is the signal to add a
config field instead.

---

## Decisions to make before you start

Four, and it is cheaper to settle them now than to change them later.

**Which Supabase account.** The free tier caps active projects per
organization. The library lives under `ziopads`; the Tamplin catalogue raisonné
was deliberately created under a separate login owned by Valerie, both to work
around that cap and so a future handoff is a transfer rather than an extraction.
Decide which applies before creating anything.

**A separate R2 bucket, or a prefix in an existing one.** This is permanent.
Image keys are baked into every stored `images[].src` value and every R2 object
key, so changing it later means rewriting every record. Separate buckets keep
access policies and lifecycles clean; a prefix keeps the credential count down.

**Whether the instance is gated.** Three postures: open (no gate), a shared
password admitting visitors to the public field-stripped view
(`PUBLIC_GATE_ENABLED`), or effectively admin-only (gated, with nobody given the
password). Admin rights are separate and layered on top in every case.

**The domain.** Needed for `NEXT_PUBLIC_SITE_URL` and for the Supabase Auth
redirect allowlist, and a mismatch there is the usual reason magic-link login
fails silently.

---

## 1. Create the Supabase project

Name it `vivarium-<instance>`, matching the local clone directory.

The security toggles on the creation screen are the part worth getting right,
because two of them fail in ways that only appear after the app ships.

**Enable Data API — ON.** Required. Everything the app reads or writes goes
through `lib/supabase.ts`, a service-role `supabase-js` client, and `supabase-js`
calls the Data API (PostgREST). Turning it off breaks the application entirely.

**Automatically expose new tables — ON.** This one is a trap. The toggle governs
default privileges in the `public` schema, and the grants it controls go to
`anon`, `authenticated` AND `service_role`. `supabase/schema.sql` contains no
`GRANT` statements, so with the toggle off the three tables are created with no
privileges for `service_role` and every read returns permission denied. The
migration applies, the dashboard shows the tables, and the failure surfaces on
first use.

> Supabase is moving this setting off by default, and on 30 October 2026 it is
> applied to existing projects. Tables that already exist keep their grants, so
> the instances already deployed are unaffected — but any table added after that
> date needs an explicit grant. The durable fix is for `schema.sql` to carry its
> own grants; until it does, leave this toggle on.

**Enable automatic RLS — ON.** Not strictly required: `schema.sql` runs
`enable row level security` on `items`, `vocab` and `wishlist` itself. The
toggle installs an event trigger that covers a table added by hand later, which
is worth having for nothing.

**Region.** "Americas" is a group; pick the specific region matching where the
Vercel project deploys.

**Database password.** Generate a strong one straight into your password
manager. It is not used by the application — only by direct-connection tooling —
and you will not be shown it again.

### Do you need Row Level Security?

Yes, in the form `schema.sql` already sets up: enabled on all three tables, with
zero policies.

The reason is not the service-role key, which bypasses RLS regardless. It is
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, which is inlined into the browser bundle so
`lib/supabase-browser.ts` can run magic-link authentication. That key is public
by design, and with the Data API on it can reach PostgREST directly. RLS enabled
with no policies is what makes it useless there.

If the browser is ever given direct read access to the catalogue, add a policy
allowlisting the open tier — `visibility = 'public'` — rather than denying the
closed ones. Stated that way round, adding a fourth tier later cannot silently
expose it.

---

## 2. Run the schema

In the Supabase SQL editor, paste `supabase/schema.sql` and run it. That is the
whole database step.

**Do not run anything in `supabase/migrations/`.** Those files exist for
databases created from an earlier version of the schema and needing to catch up.
`schema.sql` always describes the current shape, so a new instance is already
current the moment it runs. Applying a migration on top would at best do nothing
and at worst re-run a backfill against rows that never needed it.

Confirm three tables (`items`, `vocab`, `wishlist`), RLS on for each, and the
`items_visibility_chk` constraint permitting `public`, `signed_in`, `admin`.

---

## 3. Add the instance to the code

Three edits, committed to `main` like anything else.

**`lib/instance.ts`** — a new `InstanceConfig`: theme name, wordmark, home URL,
nav links, whether the app's own nav shows, footer, and page metadata.

Note the resolution at the bottom of that file: `instances[...] ?? library`. An
unrecognised `NEXT_PUBLIC_INSTANCE` falls back to the library identity silently,
with no warning anywhere. If a new deployment renders the Vivarium wordmark and
the parchment palette, that fallback is what you are looking at.

**`app/globals.css`** — a `[data-theme="<instance>"]` block. The token names
never change, only their values; `layout.tsx` sets `data-theme` from
`NEXT_PUBLIC_INSTANCE`. Both colour and font tokens are per instance.

**`typeOptions` in the instance config** — which item types this instance offers
in its type picker. `ITEM_TYPES` and `typeFields` stay global, since the field
definitions are shared; only the picker list is scoped, so a catalogue raisonné
is not offered `Hardware` and a studio inventory is not offered `Drawing`.

Remember that `NEXT_PUBLIC_` variables are inlined at BUILD time. Changing
`NEXT_PUBLIC_INSTANCE` requires a redeploy, not just an environment edit.

---

## 4. Clone the repository

One local clone per instance you run or ingest into, named for the instance:

    _PROJECTS/vivarium/              library
    _PROJECTS/vivarium-sirsinate/    Sirsinate
    _PROJECTS/vivarium-<instance>/   …

    cd ~/Desktop/_PROJECTS
    git clone git@github.com:ziopads/vivarium.git vivarium-<instance>
    cd vivarium-<instance>
    npm install

Same origin, same branch, no fork. The point is that `.env.local` is a real file
in each tree rather than a symlink toggled between instances: instance identity
becomes directory state, `pwd` answers the question, and a script run in the
wrong tree cannot reach another instance's database because those credentials
are not in that tree at all.

Every Vercel project deploys from `main`, so a push redeploys all of them. That
is fine for additive config, but check what a change touches before pushing when
any instance is behind on migrations.

You do not need a clone for an instance you never run locally. Production
environment variables live in the Vercel project regardless.

---

## 5. `.env.local`

A real file in the clone, never a symlink. Fill from `.env.example`; the fields
that matter for a new instance:

    NEXT_PUBLIC_SUPABASE_URL
    NEXT_PUBLIC_SUPABASE_ANON_KEY
    SUPABASE_SERVICE_ROLE_KEY       server only — never reaches the client
    SUPABASE_DB_URL                 pooled connection string, port 6543
    AUTH_ALLOWLIST                  emails permitted to sign in at all
    AUTH_ADMINS                     the subset permitted to edit
    NEXT_PUBLIC_SITE_URL
    NEXT_PUBLIC_INSTANCE            must match the key in lib/instance.ts
    R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY
    R2_BUCKET / NEXT_PUBLIC_R2_PUBLIC_URL

**Leave `LOCAL_DATA_FILE` unset.** Setting it forces local JSON mode even when
Supabase is fully configured — naming a dataset is treated as an unambiguous
statement about which one you want — and the symptom is a clone that appears to
work while quietly ignoring the database you just built.

`PUBLIC_GATE_ENABLED` and `PUBLIC_GATE_PASSWORD` belong in the Vercel project
rather than your working `.env.local`; you do not want to type a password to see
your own development catalogue.

Back each `.env.local` up somewhere outside the repository. It is gitignored, a
clone is disposable, and for at least one instance that file has been the only
reliable pointer at a Supabase project that could not otherwise be signed into.

---

## 6. Seed the vocabulary

A new instance starts with an empty `vocab` table, and the classification tree
is built by hand in `/admin/vocab` — a Finder-style column editor, with one tab
per item type. Tag each ROOT with the types it serves; the tag inherits
downward, and an untagged branch serves everything.

Filing depends on this, so it comes before cataloguing rather than after.

**A caution about seeding items from JSON.** `scripts/migrate-to-supabase.mjs`
is a full reseed for an empty or disposable database and requires
`--full-reseed`. It has two defects as of September 2026 and should be fixed
before it is used again:

- its visibility mapping still speaks the pre-2026-09-03 vocabulary, emitting
  `restricted` (which the current CHECK constraint rejects) and flattening
  `signed_in` and `admin` to `public` — silently publishing closed records;
- its `COLUMN_KEYS` set omits `classification`, so the authoritative filing path
  lands in the `attributes` bag and the column is left null.

An instance starting from nothing avoids both, since there is nothing to seed
but the vocabulary.

---

## 7. Images

Create the bucket or settle the prefix, per the decision above; `docs/R2-SETUP.md`
has the bucket and API-token procedure. R2 charges no egress, which is why it is
used rather than Supabase Storage.

Image keys are permanent once records exist. Do not revisit this after
cataloguing starts.

---

## 8. Deploy on Vercel

1. Import the repository as a new Vercel project — same repository, tracking
   `main`, like the others.
2. Add every environment variable from the clone's `.env.local`, plus the gate
   variables if the instance is gated.
3. Deploy and attach the domain.

**If repository import shows the wrong account's repositories**, the Vercel
account's email and its linked GitHub identity are different accounts. Fix it
under Vercel → Settings → Authentication, in the Sign-in Methods section, rather
than anywhere on the import screen.

**Domain.** A Namecheap CNAME pointing at `cname.vercel-dns.com`, set to
DNS-only — the grey cloud, if the DNS is on Cloudflare. Namecheap's Host field
takes the subdomain part alone, not the full name.

---

## 9. Magic-link email

The step that most often looks like a broken deployment when it is a
configuration gap.

**Add the deployment URL to Supabase Auth → URL Configuration**, as both Site URL
and an allowed Redirect URL, and enable the Email provider. Until that is done,
magic links bounce to `localhost` and sign-in simply fails.

**Use custom SMTP rather than the built-in mailer**, which throttles hard enough
to be unusable once more than one person is signing in. Resend is what the other
instances use. Three traps, all of which have cost time:

- The SMTP **username is literally `resend`**, not an application name or an
  email address.
- The SMTP **password is the Resend API key**.
- A browser password manager will cheerfully autofill both fields with something
  else. Type them by hand and check them afterwards.

**The sending domain is a subdomain**, `send.gaffcutter.com` rather than the root.
The root already forwards mail through ImprovMX and carries its own MX records, so
a sending domain on the root would collide with them. Set up each new instance's
sender the same way.

---

## Verification

- `/` loads and shows the right wordmark, palette and nav. The library's
  parchment look means `NEXT_PUBLIC_INSTANCE` did not match a config key.
- Magic-link sign-in works for an `AUTH_ALLOWLIST` address, and an
  `AUTH_ADMINS` address sees edit controls.
- The type picker offers this instance's types and no others.
- `/admin/vocab` saves a tree edit and the change survives a reload.
- Create one item, then redeploy, then confirm it is still there. This is the
  only check that proves you are on the database rather than an ephemeral
  filesystem.
- If the instance is gated, confirm a signed-out visitor is stopped, and that a
  gated visitor's network responses carry no private fields.

---

## Afterwards

Record the new instance in the table in `supabase/migrations/README.md`, with
the account it lives under and the schema version it was created from. Every
later schema change belongs in both `schema.sql` (so new instances get it) and a
dated migration (so the instances already deployed can catch up). Editing only
`schema.sql` is the failure mode: a fresh install works and every running
instance breaks on its first write.

Backups are a per-instance task and are not automated: a scheduled dump of
`items`, `vocab` and `wishlist`, and a sync of the image bucket. Test a restore
once, so you know it works.
