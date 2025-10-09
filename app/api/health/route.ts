import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET() {
  try {
    // Check database connection
    const supabase = supabaseAdmin();
    const { error } = await supabase.from('sections').select('id').limit(1);

    if (error) {
      return NextResponse.json({ status: 'unhealthy', error: error.message }, { status: 503 });
    }

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.VERCEL_ENV || 'development',
    });
  } catch (error) {
    return NextResponse.json({ status: 'unhealthy', error: String(error) }, { status: 503 });
  }
}
