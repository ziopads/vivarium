# Cloudflare R2 — image storage for an instance

Object storage for a Vivarium instance's images. R2 is S3-compatible and charges
**no egress**, which is why it is used rather than Supabase Storage for files
that get served repeatedly.

Part of standing up an instance — see `docs/NEW-INSTANCE.md` for where this fits
in the sequence. About ten minutes.

## The decision this depends on

A separate bucket per instance, or a prefix inside an existing one.

**This is permanent.** The key of every image is baked into that record's stored
`images[].src` value, so changing the arrangement after cataloguing has started
means rewriting every record and moving every object. Settle it before the first
upload.

Separate buckets keep access policies, lifecycles and tokens cleanly divided,
which matters when one instance is public and another holds a commercially
sensitive catalogue. A shared bucket with per-instance prefixes keeps the number
of credentials down. The application code is identical either way: it reads
`R2_BUCKET` and `NEXT_PUBLIC_R2_PUBLIC_URL`, and the per-instance image
directory is set by `NEXT_PUBLIC_LOCAL_IMAGE_DIR` for local development.

If you are adding a prefix to an existing bucket, skip to step 5 — the bucket,
its public URL and its token already exist.

---

## 1. Enable R2 on the Cloudflare account

1. Sign in at https://dash.cloudflare.com.
2. In the sidebar, open **R2**.
3. If prompted, add a payment method. This is required to activate R2 even though
   the free tier costs nothing: 10 GB storage, 1M writes, 10M reads per month,
   and no egress charges. An instance's images run 1–3 GB, so it stays free.

## 2. Create the bucket

1. **R2 → Create bucket.**
2. Name it for the instance — `vivarium`, `vivarium-sirsinate`, and so on.
3. Location **Automatic**, storage class **Standard**.

## 3. Turn on public serving

1. Open the bucket → **Settings**.
2. Under **Public Development URL** (the `r2.dev` option), click **Enable** and
   confirm.
3. Copy the URL, which looks like `https://pub-<hash>.r2.dev`. This is
   `NEXT_PUBLIC_R2_PUBLIC_URL`.

`r2.dev` is fine indefinitely for a small instance. For anything with a real
audience, point a subdomain at the bucket instead — a custom domain avoids
Cloudflare's rate limiting on `r2.dev` and keeps image URLs stable if the bucket
is ever replaced.

## 4. Create an API token

1. In the sidebar go to **Storage & databases → R2 → Overview**. On that page
   find the **API Tokens** section and click **Manage** — *not* the generic
   My Profile → API Tokens page, which issues the wrong kind of token.
2. **Create Account API token**, named for the instance.
3. Permissions: **Object Read & Write**.
4. Scope: **Apply to specific buckets only**, and pick this instance's bucket.
   Scoping matters — an account-wide token in one instance's `.env.local`
   defeats the separation the clones are for.
5. **Create API Token.**
6. Copy the three values, shown once:
   - **Access Key ID**
   - **Secret Access Key** — you will not see it again
   - the **S3 endpoint**, `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`. The
     hex string in the middle is `R2_ACCOUNT_ID`.

## 5. Put the values in `.env.local`

In that instance's clone. The file is gitignored, so the secret stays local.

```dotenv
# --- Cloudflare R2 (image storage) ---
R2_ACCOUNT_ID=                   # the hex from the S3 endpoint
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=            # server and scripts only
R2_BUCKET=
NEXT_PUBLIC_R2_PUBLIC_URL=https://pub-xxxx.r2.dev
```

The same five go into the instance's Vercel project. `NEXT_PUBLIC_R2_PUBLIC_URL`
is inlined at build time, so changing it needs a redeploy rather than only an
environment edit.

For local development against images on disk rather than R2, set
`NEXT_PUBLIC_LOCAL_IMAGE_DIR`. It wins over R2 deliberately, so a development
clone holding one instance's R2 credentials cannot fetch another instance's
images from the wrong bucket.

## 6. Check it

Upload one image through the application and confirm it renders from
`${NEXT_PUBLIC_R2_PUBLIC_URL}/<key>`, then reload to confirm the record kept the
reference. A 404 here is almost always the public development URL not having been
enabled in step 3.

---

## Pricing

Storage $0.015/GB-month, no egress fees, 10 GB free. A few dollars a year at
most for a catalogue of this size.
