import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Hardcoded S3 bucket name
const S3_BUCKET_NAME = 'set4-data';

export const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const s3 = s3Client;

export async function presignPut(key: string, contentType: string, expiresSeconds = 60) {
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
    ACL: 'private',
  });
  const url = await getSignedUrl(s3, command, { expiresIn: expiresSeconds });
  return url;
}

export async function presignGet(key: string, expiresSeconds = 3600) {
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: key,
  });
  const url = await getSignedUrl(s3, command, { expiresIn: expiresSeconds });
  return url;
}

export function s3KeyForScreenshot(projectId: string, checkId: string, screenshotId: string) {
  return `projects/${projectId}/screenshots/${checkId}/${screenshotId}.png`;
}

export function s3KeyForThumb(projectId: string, checkId: string, screenshotId: string) {
  return `projects/${projectId}/screenshots/${checkId}/${screenshotId}_thumb.png`;
}

export function s3KeyForPdf(projectId: string, filename: string) {
  return `projects/${projectId}/pdfs/${filename}`;
}

export function s3PublicUrl(key: string) {
  // If you serve via CloudFront, swap this impl.
  return `s3://${S3_BUCKET_NAME}/${key}`;
}
