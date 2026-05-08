import { NextResponse } from 'next/server'
import { getSavedItems, removeSavedItem, saveItem } from '@/lib/db/saved'
import type { SavedFilters, SavedItemType } from '@/lib/types'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const type = (url.searchParams.get('type') ?? 'all') as SavedFilters['type']
    const category = url.searchParams.get('category') ?? undefined
    const country = url.searchParams.get('country') ?? undefined
    const data = await getSavedItems({ type, category, country })
    return NextResponse.json({ status: 'ok', ...data })
  } catch (err) {
    return NextResponse.json(
      { status: 'error', error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { itemType?: SavedItemType; itemId?: string }
    if (!body.itemType || !body.itemId) {
      return NextResponse.json({ error: 'itemType and itemId are required' }, { status: 400 })
    }
    const saved = await saveItem({ itemType: body.itemType, itemId: body.itemId })
    return NextResponse.json({ status: 'ok', ...saved })
  } catch (err) {
    return NextResponse.json(
      { status: 'error', error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}

export async function DELETE(req: Request) {
  try {
    const body = (await req.json()) as { itemType?: SavedItemType; itemId?: string }
    if (!body.itemType || !body.itemId) {
      return NextResponse.json({ error: 'itemType and itemId are required' }, { status: 400 })
    }
    const removed = await removeSavedItem({ itemType: body.itemType, itemId: body.itemId })
    return NextResponse.json({ status: 'ok', ...removed })
  } catch (err) {
    return NextResponse.json(
      { status: 'error', error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
