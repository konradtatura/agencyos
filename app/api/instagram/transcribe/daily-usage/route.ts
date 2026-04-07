/**
 * GET /api/instagram/transcribe/daily-usage
 *
 * Returns how many reels the authenticated creator has transcribed today.
 * Response: { count: number; limit: number; remaining: number }
 */

import { NextResponse } from 'next/server'
import { resolveCrmUser } from '@/app/api/crm/_auth'
import { TRANSCRIPTION_DAILY_LIMIT } from '@/lib/instagram/transcription-limits'

export async function GET() {
  const auth = await resolveCrmUser()
  if ('error' in auth) return auth.error
  const { admin, creatorId } = auth
  if (!creatorId) return NextResponse.json({ error: 'No creator profile' }, { status: 403 })

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
