import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';

const execAsync = promisify(exec);

// Cache for section data (in production, use Redis)
const sectionsCache = new Map<string, unknown>();

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const codeId = searchParams.get('codeId');

  if (!codeId) {
    return NextResponse.json({ error: 'codeId is required' }, { status: 400 });
  }

  try {
    // Check cache first
    if (sectionsCache.has(codeId)) {
      // Return cached sections
      return NextResponse.json(sectionsCache.get(codeId));
    }

    // Execute Python script to get sections
    const scriptPath = path.join(process.cwd(), 'export_sections_for_frontend.py');
    const outputPath = path.join(process.cwd(), 'temp', `${codeId.replace(/[^a-zA-Z0-9]/g, '_')}_sections.json`);

    // Ensure temp directory exists
    await fs.mkdir(path.join(process.cwd(), 'temp'), { recursive: true });

    // Run the Python script
    const command = `python3 ${scriptPath} --code-id "${codeId}" --output "${outputPath}"`;

    // Execute Python script
    const { stderr } = await execAsync(command, {
      env: {
        ...process.env,
        PYTHONPATH: process.cwd(),
      },
    });

    if (stderr && !stderr.includes('INFO:')) {
      throw new Error(`Python script error: ${stderr}`);
    }

    // Read the output file
    const sectionsData = await fs.readFile(outputPath, 'utf-8');
    const sections = JSON.parse(sectionsData);

    // Cache the result
    sectionsCache.set(codeId, sections);

    // Clean up temp file
    await fs.unlink(outputPath).catch(() => {}); // Ignore errors

    return NextResponse.json(sections);

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch sections', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Get a single section with its full context (including references)
export async function POST(request: NextRequest) {
  const { sectionKey } = await request.json();

  if (!sectionKey) {
    return NextResponse.json({ error: 'sectionKey is required' }, { status: 400 });
  }

  // This endpoint would fetch a single section with all its references
  // For now, we'll return a placeholder
  // In production, this would query Neo4j directly for the specific section

  return NextResponse.json({
    message: 'Single section endpoint - to be implemented',
    sectionKey,
  });
}