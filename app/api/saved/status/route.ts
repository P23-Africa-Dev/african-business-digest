import { NextResponse } from 'next/server'
import { getSavedLookup } from '@/lib/db/saved'

function parseCsvParam(value: string | null): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const storyIds = parseCsvParam(url.searchParams.get('storyIds'))
    const discussionIds = parseCsvParam(url.searchParams.get('discussionIds'))
    const lookup = await getSavedLookup({ storyIds, discussionIds })
    return NextResponse.json({ status: 'ok', ...lookup })
  } catch (err) {
    return NextResponse.json(
      { status: 'error', error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
