import { NextResponse } from 'next/server';
import { getCodeAssembly } from '@/lib/neo4j';

export async function GET(_: Request, { params }: { params: { codeId: string } }) {
  const assembly = await getCodeAssembly(params.codeId);
  return NextResponse.json({ assembly });
}