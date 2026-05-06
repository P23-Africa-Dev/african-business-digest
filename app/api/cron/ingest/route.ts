import { NextResponse } from 'next/server'
import { runIngestion } from '@/lib/sources'

export const maxDuration = 120

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = new Date().toISOString()
  const t0 = Date.now()
  try {
    const ingestResult = await runIngestion()
    return NextResponse.json({
      status: 'ok',
      tier: 'ingest',
      startedAt,
      ms: Date.now() - t0,
      ...ingestResult,
    })
  } catch (err) {
    return NextResponse.json(
      { status: 'error', startedAt, error: String(err), ms: Date.now() - t0 },
      { status: 500 }
    )
  }
}
