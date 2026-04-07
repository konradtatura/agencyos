/**
 * GET /api/instagram/transcribe/daily-usage
 *
 * Returns how many reels the authenticated creator has transcribed today.
 * Response: { count: number; limit: number; remaining: number }
 */

import { NextResponse } from 'next/server'
import { getCreatorId } from '@/lib/get-creator-id'
import { createAdminClient } from '@/lib/supabase/admin'
import { TRANSCRIPTION_DAILY_LIMIT } from '@/lib/instagram/transcription-limits'

export async function GET() {
  const creatorId = await getCreatorId()
  if (!creatorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient()

  const today = new Date().toISOString().split('T')[0]

  const { data: row } = await admin
    .from('transcription_usage')
    .select('count')
    .eq('creator_id', creatorId)
    .eq('date', today)
    .maybeSingle()

  const count = row?.count ?? 0

  return NextResponse.json({
    count,
    limit:     TRANSCRIPTION_DAILY_LIMIT,
    remaining: Math.max(0, TRANSCRIPTION_DAILY_LIMIT - count),
  })
}
