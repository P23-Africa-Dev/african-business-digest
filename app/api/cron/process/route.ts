import { NextResponse } from 'next/server'
import { runIngestion } from '@/lib/sources'
import { clusterRawItems } from '@/lib/processing/cluster'
import { runDiff } from '@/lib/processing/diff'
import { processDiscussions } from '@/lib/processing/discussions'
import { checkAnthropicProcessingAllowed } from '@/lib/processing/budget'
import { createServerClient } from '@/lib/db/client'

export const maxDuration = 300

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const start = Date.now()
  const log: Record<string, unknown> = { startedAt: new Date().toISOString() }
  const db = createServerClient()

  async function tableCounts() {
    const [rawItems, stories, discussions] = await Promise.all([
      db.from('raw_items').select('id', { count: 'exact', head: true }),
      db.from('stories').select('id', { count: 'exact', head: true }),
      db.from('discussions').select('id', { count: 'exact', head: true }),
    ])
    return {
      rawItems: rawItems.count ?? 0,
      stories: stories.count ?? 0,
      discussions: discussions.count ?? 0,
      errors: {
        rawItems: rawItems.error?.message ?? null,
        stories: stories.error?.message ?? null,
        discussions: discussions.error?.message ?? null,
      },
    }
  }

  const anthropic = await checkAnthropicProcessingAllowed()
  log.budgetAnthropic = {
    allowed: anthropic.allowed,
    dailySpentUsd: anthropic.dailySpentUsd,
    monthlySpentUsd: anthropic.monthlySpentUsd,
    reason: anthropic.reason,
  }
  if (!anthropic.allowed) {
    console.warn('[Cron] Anthropic budget blocked; running ingest-only', anthropic.reason)
    try {
      log.countsBefore = await tableCounts()
      const t0 = Date.now()
      const ingestResult = await runIngestion()
      log.ingestion = { ...ingestResult, ms: Date.now() - t0 }
      log.countsAfterIngestion = await tableCounts()
      log.totalMs = Date.now() - start
      log.status = 'ingest_only_budget'
      return NextResponse.json(log)
    } catch (err) {
      console.error('[Cron] Ingest-only fatal:', err)
      return NextResponse.json(
        { error: String(err), log, totalMs: Date.now() - start },
        { status: 500 }
      )
    }
  }

  try {
    log.countsBefore = await tableCounts()
    console.log('[Cron] Initial table counts:', log.countsBefore)

    console.log('[Cron] Starting ingestion...')
    const t0 = Date.now()
    const ingestResult = await runIngestion()
    log.ingestion = { ...ingestResult, ms: Date.now() - t0 }
    log.countsAfterIngestion = await tableCounts()
    console.log('[Cron] Ingestion complete:', log.ingestion)
    console.log('[Cron] Counts after ingestion:', log.countsAfterIngestion)

    console.log('[Cron] Starting clustering...')
    const t1 = Date.now()
    const storiesCreated = await clusterRawItems()
    log.clustering = { storiesCreated, ms: Date.now() - t1 }
    log.countsAfterClustering = await tableCounts()
    console.log('[Cron] Clustering complete:', log.clustering)
    console.log('[Cron] Counts after clustering:', log.countsAfterClustering)

    console.log('[Cron] Running diff...')
    const t2 = Date.now()
    await runDiff()
    log.diff = { ms: Date.now() - t2 }
    console.log('[Cron] Diff complete:', log.diff)

    console.log('[Cron] Processing discussions...')
    const t3 = Date.now()
    const discussionsProcessed = await processDiscussions()
    log.discussions = { discussionsProcessed, ms: Date.now() - t3 }
    log.countsAfterDiscussions = await tableCounts()
    console.log('[Cron] Discussions complete:', log.discussions)
    console.log('[Cron] Counts after discussions:', log.countsAfterDiscussions)

    log.totalMs = Date.now() - start
    log.status = 'ok'
    return NextResponse.json(log)
  } catch (err) {
    console.error('[Cron] Fatal error:', err)
    return NextResponse.json(
      { error: String(err), log, totalMs: Date.now() - start },
      { status: 500 }
    )
  }
}
