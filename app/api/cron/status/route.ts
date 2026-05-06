import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/db/client'

export async function GET() {
  const db = createServerClient()
  const { data, error } = await db
    .from('raw_items')
    .select('ingested_at')
    .order('ingested_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const lastRunAt = data?.ingested_at ?? null
  const todayUtc = new Date().toISOString().slice(0, 10)
  const ranToday = lastRunAt ? new Date(lastRunAt).toISOString().slice(0, 10) === todayUtc : false

  return NextResponse.json({ ranToday, lastRunAt })
}
