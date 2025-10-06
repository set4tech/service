#!/usr/bin/env node

/**
 * Generate separate images for each PDF layer and upload to S3
 *
 * Usage: node scripts/generate-layer-images.mjs <pdf-url> <project-id>
 */

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from 'canvas';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createReadStream } from 'fs';
import { writeFile, unlink } from 'fs/promises';
import { createSupabaseClient } from '../lib/supabase-server.js';

// Configure PDF.js worker
import('pdfjs-dist/legacy/build/pdf.worker.mjs');

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.S3_BUCKET_NAME;

async function generateLayerImages(pdfUrl, projectId) {
  console.log('='.repeat(80));
  console.log('PDF LAYER IMAGE GENERATOR');
  console.log('='.repeat(80));
  console.log();
  console.log('PDF URL:', pdfUrl);
  console.log('Project ID:', projectId);
  console.log();

  // Load PDF
  console.log('Loading PDF...');
  const loadingTask = getDocument(pdfUrl);
  const pdf = await loadingTask.promise;
  console.log(`✓ PDF loaded: ${pdf.numPages} pages`);
  console.log();

  // Get optional content config
  console.log('Extracting layers...');
  const ocConfig = await pdf.getOptionalContentConfig();

  if (!ocConfig) {
    console.log('✗ No layers found in PDF');
    return;
  }

  const order = ocConfig.getOrder();
  if (!order || order.length === 0) {
    console.log('✗ No layer order found');
    return;
  }

  const layers = [];
  for (const id of order) {
    const group = ocConfig.getGroup(id);
    layers.push({
      id: id,
      name: group?.name || `Layer ${id}`,
      visible: ocConfig.isVisible(id),
    });
  }

  console.log(`✓ Found ${layers.length} layers:`);
  layers.forEach((l, i) => {
    console.log(`  ${i + 1}. "${l.name}" (ID: ${l.id})`);
  });
  console.log();

  // Process each page
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    console.log(`Processing page ${pageNum}/${pdf.numPages}...`);
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 });

    // Render each layer separately
    for (const layer of layers) {
      console.log(`  Rendering layer "${layer.name}"...`);

      // Hide all layers
      for (const l of layers) {
        await ocConfig.setVisibility(l.id, false);
      }

      // Show only current layer
      await ocConfig.setVisibility(layer.id, true);

      // Create canvas
      const canvas = createCanvas(viewport.width, viewport.height);
      const context = canvas.getContext('2d');

      // White background
      context.fillStyle = 'white';
      context.fillRect(0, 0, canvas.width, canvas.height);

      // Render
      await page.render({
        canvasContext: context,
        viewport: viewport,
        optionalContentConfigPromise: Promise.resolve(ocConfig),
      }).promise;

      // Save to temp file
      const tempPath = `/tmp/layer-${pageNum}-${layer.id}.png`;
      const buffer = canvas.toBuffer('image/png');
      await writeFile(tempPath, buffer);

      // Upload to S3
      const s3Key = `projects/${projectId}/layers/page-${pageNum}-${layer.id}.png`;
      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: s3Key,
          Body: buffer,
          ContentType: 'image/png',
        })
      );

      console.log(`    ✓ Uploaded to s3://${BUCKET}/${s3Key}`);

      // Cleanup temp file
      await unlink(tempPath);
    }

    // Render all layers combined
    console.log(`  Rendering all layers combined...`);
    for (const l of layers) {
      await ocConfig.setVisibility(l.id, true);
    }

    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: context,
      viewport: viewport,
      optionalContentConfigPromise: Promise.resolve(ocConfig),
    }).promise;

    const tempPath = `/tmp/layer-${pageNum}-all.png`;
    const buffer = canvas.toBuffer('image/png');
    await writeFile(tempPath, buffer);

    const s3Key = `projects/${projectId}/layers/page-${pageNum}-all.png`;
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: s3Key,
        Body: buffer,
        ContentType: 'image/png',
      })
    );

    console.log(`    ✓ Uploaded to s3://${BUCKET}/${s3Key}`);
    await unlink(tempPath);

    console.log();
  }

  console.log('✓ Layer image generation complete!');
}

// Parse CLI args
const [pdfUrl, projectId] = process.argv.slice(2);

if (!pdfUrl || !projectId) {
  console.error('Usage: node scripts/generate-layer-images.mjs <pdf-url> <project-id>');
  process.exit(1);
}

// Run
generateLayerImages(pdfUrl, projectId).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
