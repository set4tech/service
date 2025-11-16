/**
 * Upload screenshot and thumbnail to S3.
 *
 * @param fullImage - Full-size screenshot blob
 * @param thumbnail - Thumbnail blob
 * @param projectId - Project ID (for plan screenshots)
 * @param checkId - Check ID (for plan screenshots)
 * @param assessmentId - Assessment ID (for elevation screenshots)
 * @param screenshotType - Type of screenshot ('plan' or 'elevation')
 * @returns S3 URLs for both images
 */
export async function uploadScreenshot(
  fullImage: Blob,
  thumbnail: Blob,
  projectId?: string,
  checkId?: string,
  assessmentId?: string,
  screenshotType?: 'plan' | 'elevation'
): Promise<{
  screenshotUrl: string;
  thumbnailUrl: string;
}> {
  console.log('[uploadScreenshot] Params:', { projectId, checkId, assessmentId, screenshotType });

  // Get presigned URLs
  const presignResponse = await fetch('/api/screenshots/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, checkId, assessmentId, screenshotType }),
  });

  if (!presignResponse.ok) {
    const error = await presignResponse.json();
    throw new Error(error.error || 'Failed to get presigned URLs');
  }

  const { uploadUrl, key, thumbUploadUrl, thumbKey } = await presignResponse.json();

  // Upload both images in parallel
  const [fullResponse, thumbResponse] = await Promise.all([
    fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: fullImage,
    }),
    fetch(thumbUploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: thumbnail,
    }),
  ]);

  if (!fullResponse.ok) {
    throw new Error(`Failed to upload screenshot: ${fullResponse.status}`);
  }

  if (!thumbResponse.ok) {
    throw new Error(`Failed to upload thumbnail: ${thumbResponse.status}`);
  }

  const bucketName = process.env.NEXT_PUBLIC_S3_BUCKET_NAME || 'bucket';

  return {
    screenshotUrl: `s3://${bucketName}/${key}`,
    thumbnailUrl: `s3://${bucketName}/${thumbKey}`,
  };
}
