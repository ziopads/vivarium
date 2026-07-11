# Cloudflare R2 setup (morning task)

Goal: stand up object storage for Vivarium's images. This is deliberately the *same*
storage pattern we'll use for the FOIA/research project (14 GB of PDFs), so we're dry-running
it here. R2 is S3-compatible and charges **zero egress**, which is why it beats S3/Supabase
Storage for files that get served repeatedly.

You'll create a bucket + an API token, drop five values into `.env.local`, and hand me three
of them (not the secret). Then I build `lib/storage.ts`, a migration that pushes your
existing images to R2, and the app-side swap to render from R2.

Estimated time: ~10 minutes.

---

## 1. Enable R2 on your Cloudflare account

1. Sign in at https://dash.cloudflare.com (create a free account if needed).
2. In the left sidebar, click **R2**.
3. If prompted, **add a payment method**. This is required to activate R2 even though the
   free tier costs nothing — **10 GB storage, 1M writes, 10M reads per month, and $0 egress
   forever.** Vivarium's images are ~1–3 GB, so you'll stay free.

## 2. Create the bucket

1. **R2 → Create bucket.**
2. Name it **`vivarium`**.
3. Location: **Automatic**. Storage class: **Standard**.
4. Create.

> Use a *separate* bucket per project (you'll make a `foia` bucket later). The code is
> identical either way; separate buckets keep the access policies and lifecycles clean —
> Vivarium public, the research corpus possibly controlled.

## 3. Turn on public serving (for the dry run)

1. Open the **`vivarium`** bucket → **Settings**.
2. Under **Public Development URL** (the `r2.dev` option), click **Enable** and confirm.
3. Copy the URL it gives you — it looks like `https://pub-<hash>.r2.dev`. **This is your
   `NEXT_PUBLIC_R2_PUBLIC_URL`.**

> `r2.dev` is fine for now. For production you'd point a subdomain (e.g.
> `img.gaffcutter.com`) at the bucket instead — a later step, not needed today.

## 4. Create an API token (the upload credentials)

1. On the R2 overview page, click **Manage R2 API Tokens** (top-right) → **Create API Token**.
2. Name: `vivarium-app`.
3. Permissions: **Object Read & Write**.
4. Scope: **Apply to specific buckets only → `vivarium`**.
5. TTL: leave as forever. **Create.**
6. Copy these three, shown once:
   - **Access Key ID**
   - **Secret Access Key** *(you won't see it again — grab it now)*
   - the **S3 endpoint**, which looks like `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
     The hex string in the middle is your **`R2_ACCOUNT_ID`**.

## 5. Put the values in `.env.local`

Add these lines (the file is git-ignored, so secrets stay local):

```dotenv
# --- Cloudflare R2 (image storage) ---
R2_ACCOUNT_ID=            # the hex from the S3 endpoint
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=     # keep this private — do not paste it in chat
R2_BUCKET=vivarium
NEXT_PUBLIC_R2_PUBLIC_URL=https://pub-xxxx.r2.dev
```

## 6. Hand back the non-secret bits

When you're done, send me: **the bucket name (`vivarium`), the account ID, and the public
URL.** Keep the access key + secret in `.env.local` — I write the code against the env-var
names, not the values.

Then I'll build:
- `lib/storage.ts` — an S3 client pointed at R2 + `uploadFile` / presign helpers (the piece
  the FOIA project reuses verbatim).
- a migration script that uploads `public/items/**` to R2 and rewrites each item's image
  references in the database.
- the app-side change to render images from `${NEXT_PUBLIC_R2_PUBLIC_URL}/<key>`.

## Pricing reference

Storage $0.015/GB-month, no egress fees, free tier 10 GB. A few dollars a year at most for
Vivarium; for the FOIA corpus, ~$0.21/month for 14 GB.
