import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { runIngestion } from '@/lib/sources'
import { clusterRawItems } from '@/lib/processing/cluster'
import { runDiff } from '@/lib/processing/diff'
import { processDiscussions } from '@/lib/processing/discussions'
import { checkAnthropicProcessingAllowed } from '@/lib/processing/budget'
import { createServerClient } from '@/lib/db/client'

export const maxDuration = 300

export async function POST() {
  const db = createServerClient()

  // Check if already ran today (UTC)
  const { data } = await db
    .from('raw_items')
    .select('ingested_at')
    .order('ingested_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const lastRunAt = data?.ingested_at ?? null
  const todayUtc = new Date().toISOString().slice(0, 10)
  const ranToday = lastRunAt ? new Date(lastRunAt).toISOString().slice(0, 10) === todayUtc : false

  if (ranToday) {
    return NextResponse.json({ error: 'Already ran today', lastRunAt }, { status: 409 })
  }

  const start = Date.now()

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
    }
  }

  try {
    const anthropic = await checkAnthropicProcessingAllowed()
    const countsBefore = await tableCounts()

    if (!anthropic.allowed) {
      const ingestResult = await runIngestion()
      revalidatePath('/')
      return NextResponse.json({
        status: 'ingest_only_budget',
        reason: anthropic.reason,
        ingestResult,
        countsBefore,
        countsAfter: await tableCounts(),
        ms: Date.now() - start,
      })
    }

    const ingestResult = await runIngestion()
    if (ingestResult.total === 0) {
      return NextResponse.json(
        {
          status: 'no_sources_ingested',
          message: 'No source items were fetched. Check API keys/network/source availability.',
          ingestResult,
          countsBefore,
          countsAfter: await tableCounts(),
          ms: Date.now() - start,
        },
        { status: 503 }
      )
    }

    if (ingestResult.persisted === 0) {
      const ingestErrorDetail = ingestResult.errors[0] ?? null
      return NextResponse.json(
        {
          status: 'ingest_not_persisted',
          message: ingestErrorDetail
            ? `Items were fetched but none were persisted to raw_items. ${ingestErrorDetail}`
            : 'Items were fetched but none were persisted to raw_items.',
          ingestResult,
          countsBefore,
          countsAfter: await tableCounts(),
          ms: Date.now() - start,
        },
        { status: 503 }
      )
    }

    const storiesCreated = await clusterRawItems()
    await runDiff()
    const discussionsProcessed = await processDiscussions()

    revalidatePath('/')

    if (storiesCreated === 0) {
      return NextResponse.json({
        status: 'no_stories_created',
        message: 'Ingestion persisted items, but clustering produced zero newsworthy stories.',
        ingestResult,
        storiesCreated,
        discussionsProcessed,
        countsBefore,
        countsAfter: await tableCounts(),
        ms: Date.now() - start,
      })
    }

    return NextResponse.json({
      status: 'ok',
      ingestResult,
      storiesCreated,
      discussionsProcessed,
      countsBefore,
      countsAfter: await tableCounts(),
      ms: Date.now() - start,
    })
  } catch (err) {
    return NextResponse.json(
      { error: String(err), ms: Date.now() - start },
      { status: 500 }
    )
  }
}
