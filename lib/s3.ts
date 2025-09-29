import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
  }
});

export async function presignPut(
  key: string,
  contentType: string,
  expiresSeconds = 60
) {
  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME!,
    Key: key,
    ContentType: contentType,
    ACL: 'private'
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
  return `s3://${process.env.S3_BUCKET_NAME}/${key}`;
}