import { NextResponse } from 'next/server';
import { getCodeAssembly } from '@/lib/neo4j';

export async function GET(_: Request, { params }: { params: Promise<{ codeId: string }> }) {
  const { codeId } = await params;
  const assembly = await getCodeAssembly(codeId);
  return NextResponse.json({ assembly });
}
