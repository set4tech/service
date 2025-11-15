import { NextRequest, NextResponse } from 'next/server';
import {
  presignPut,
  s3KeyForScreenshot,
  s3KeyForThumb,
  s3KeyForElevationScreenshot,
  s3KeyForElevationThumb,
} from '@/lib/s3';
import { randomUUID } from 'crypto';

export async function POST(req: NextRequest) {
  const { projectId, checkId, assessmentId, screenshotType } = await req.json();

  console.log('[presign] Request:', { projectId, checkId, assessmentId, screenshotType });

  const screenshotId = randomUUID();
  let key: string;
  let tkey: string;

  // For elevations, use assessmentId as the middle segment
  if (screenshotType === 'elevation') {
    if (!assessmentId) {
      return NextResponse.json({ error: 'assessmentId required for elevations' }, { status: 400 });
    }
    key = s3KeyForElevationScreenshot(assessmentId, screenshotId);
    tkey = s3KeyForElevationThumb(assessmentId, screenshotId);
    console.log('[presign] Elevation keys:', { key, tkey });
  } else {
    // For plan screenshots, require both projectId and checkId
    if (!projectId || !checkId) {
      return NextResponse.json(
        { error: 'projectId and checkId required for plan screenshots' },
        { status: 400 }
      );
    }
    key = s3KeyForScreenshot(projectId, checkId, screenshotId);
    tkey = s3KeyForThumb(projectId, checkId, screenshotId);
    console.log('[presign] Plan keys:', { key, tkey });
  }

  // Generate both presigned URLs in parallel
  const [uploadUrl, thumbUploadUrl] = await Promise.all([
    presignPut(key, 'image/png', 120),
    presignPut(tkey, 'image/png', 120),
  ]);

  return NextResponse.json({ screenshotId, key, uploadUrl, thumbKey: tkey, thumbUploadUrl });
}
