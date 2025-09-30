import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Run raw SQL using Supabase
    const { error } = await supabase.rpc('exec_sql', {
      query: 'ALTER TABLE projects ADD COLUMN IF NOT EXISTS selected_code_ids TEXT[]',
    });

    if (error) {
      // If exec_sql doesn't exist, use REST API directly
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: 'ALTER TABLE projects ADD COLUMN IF NOT EXISTS selected_code_ids TEXT[]',
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to execute SQL: ${await response.text()}`);
      }
    }

    return NextResponse.json({ success: true, message: 'Migration applied successfully' });
  } catch (error) {
    console.error('Error running migration:', error);
    return NextResponse.json(
      {
        error: 'Migration failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
