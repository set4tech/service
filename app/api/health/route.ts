import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET() {
  const startTime = Date.now();

  try {
    const supabase = supabaseAdmin();

    // Check database connection with a simple query
    const dbCheckStart = Date.now();
    const { error: dbError } = await supabase.from('sections').select('id').limit(1);
    const dbCheckTime = Date.now() - dbCheckStart;

    if (dbError) {
      return NextResponse.json(
        {
          status: 'unhealthy',
          error: dbError.message,
          checks: {
            database: 'failed',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 503 }
      );
    }

    // Get latest migration version (from supabase_migrations table)
    const migrationCheckStart = Date.now();
    const { data: migrations, error: migrationError } = await supabase
      .from('supabase_migrations')
      .select('version, name')
      .order('version', { ascending: false })
      .limit(1)
      .single();
    const migrationCheckTime = Date.now() - migrationCheckStart;

    const latestMigration = migrations
      ? {
          version: migrations.version,
          name: migrations.name,
        }
      : null;

    const totalResponseTime = Date.now() - startTime;

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.VERCEL_ENV || 'development',
      version: process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7) || 'unknown',
      checks: {
        database: 'ok',
        migrations: migrationError ? 'warning' : 'ok',
      },
      metrics: {
        responseTime: totalResponseTime,
        database: {
          connectionTime: dbCheckTime,
          migrationCheckTime: migrationCheckTime,
        },
      },
      migration: latestMigration || {
        warning: 'Could not determine latest migration',
      },
    });
  } catch (error) {
    const totalResponseTime = Date.now() - startTime;

    return NextResponse.json(
      {
        status: 'unhealthy',
        error: String(error),
        timestamp: new Date().toISOString(),
        metrics: {
          responseTime: totalResponseTime,
        },
      },
      { status: 503 }
    );
  }
}
