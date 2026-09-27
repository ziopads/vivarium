import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Server-only. Cloudflare R2 (S3-compatible) upload. Reusable file layer —
// the same client serves the FOIA project's page images later.
const accountId = process.env.R2_ACCOUNT_ID || '';
const accessKeyId = process.env.R2_ACCESS_KEY_ID || '';
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || '';
const bucket = process.env.R2_BUCKET || '';

export function r2Configured(): boolean {
  return !!(accountId && accessKeyId && secretAccessKey && bucket);
}

let client: S3Client | null = null;
/** The shared R2 client. Also used by lib/studioAudio.ts for the private audio bucket. */
export function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return client;
}

export async function uploadToR2(key: string, body: Uint8Array | Buffer, contentType: string): Promise<void> {
  await getClient().send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
  );
}

export async function deleteFromR2(key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/**
 * A short-lived signed GET for an object in the instance's image bucket. Used
 * by /api/img when NEXT_PUBLIC_PRIVATE_IMAGES=1 and the bucket has no public URL.
 */
export async function signImageGet(key: string, expiresIn: number): Promise<string> {
  return getSignedUrl(getClient(), new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn });
}
