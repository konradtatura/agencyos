import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import PageHeader from '@/components/ui/page-header'
import StoriesView, { type StoryRow, type SequenceRow } from './stories-view'

export default async function StoriesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()

  // ── Resolve creator ───────────────────────────────────────────────────────
  const { data: profile } = await admin
    .from('creator_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  // ── Stories ───────────────────────────────────────────────────────────────
  const { data: rawStories } = profile
    ? await admin
        .from('instagram_stories')
        .select('id, ig_story_id, media_type, media_url, thumbnail_url, posted_at, expires_at, impressions, reach, taps_forward, taps_back, exits, replies, link_clicks, exit_rate')
        .eq('creator_id', profile.id)
        .order('posted_at', { ascending: false })
    : { data: null }

  const stories: StoryRow[] = (rawStories ?? []).map((s) => ({
    id:            s.id,
    ig_story_id:   s.ig_story_id,
    media_type:    s.media_type as 'IMAGE' | 'VIDEO',
    media_url:     s.media_url     ?? null,
    thumbnail_url: s.thumbnail_url ?? null,
    posted_at:     s.posted_at,
    expires_at:    s.expires_at,
    impressions:   s.impressions   ?? null,
    reach:         s.reach         ?? null,
    taps_forward:  s.taps_forward  ?? null,
    taps_back:     s.taps_back     ?? null,
    exits:         s.exits         ?? null,
    replies:       s.replies       ?? null,
    link_clicks:   s.link_clicks   ?? null,
    // numeric(6,3) comes back as a string from PostgREST
    exit_rate:     s.exit_rate != null ? Number(s.exit_rate) : null,
  }))

  // ── Sequences ─────────────────────────────────────────────────────────────
  const { data: rawSeqs } = profile
    ? await admin
        .from('story_sequences')
        .select('id, name, cta_type, correlated_dm_count, created_at')
        .eq('creator_id', profile.id)
        .order('created_at', { ascending: false })
    : { data: null }

  const seqList = rawSeqs ?? []
  const seqIds  = seqList.map((s) => s.id)

  // ── Slide data for sequence metrics ──────────────────────────────────────
  // Step 1: raw slide rows
  const { data: rawSlides } = seqIds.length
    ? await admin
        .from('story_sequence_slides')
        .select('id, sequence_id, slide_order, story_id')
        .in('sequence_id', seqIds)
        .order('slide_order', { ascending: true })
    : { data: null }

  const slides = rawSlides ?? []

  // Step 2: fetch impressions + replies for the referenced stories
  const storyIds = Array.from(new Set(slides.map((s) => s.story_id as string)))
  const { data: rawSlideStories } = storyIds.length
    ? await admin
        .from('instagram_stories')
        .select('id, impressions, replies')
        .in('id', storyIds)
    : { data: null }

  const storyMetricMap = new Map<string, { impressions: number | null; replies: number | null }>()
  for (const s of rawSlideStories ?? []) {
    storyMetricMap.set(s.id as string, {
      impressions: s.impressions ?? null,
      replies:     s.replies     ?? null,
    })
  }

  // Step 3: group slides by sequence
  type EnrichedSlide = { slide_order: number; impressions: number | null; replies: number | null }
  const slidesBySeq = new Map<string, EnrichedSlide[]>()
  for (const slide of slides) {
    const seqId  = slide.sequence_id as string
    const metric = storyMetricMap.get(slide.story_id as string) ?? { impressions: null, replies: null }
    if (!slidesBySeq.has(seqId)) slidesBySeq.set(seqId, [])
    slidesBySeq.get(seqId)!.push({ slide_order: slide.slide_order as number, ...metric })
  }

  // ── Build SequenceRow[] ───────────────────────────────────────────────────
  const sequences: SequenceRow[] = seqList.map((seq) => {
    const seqSlides  = slidesBySeq.get(seq.id) ?? []
    const slideCount = seqSlides.length

    const firstSlide = seqSlides.find((s) => s.slide_order === 1)
    const lastSlide  = seqSlides.reduce<EnrichedSlide | null>(
      (max, s) => (max === null || s.slide_order > max.slide_order ? s : max),
      null,
    )

    const firstImpressions = firstSlide?.impressions ?? null
    const lastImpressions  = lastSlide?.impressions  ?? null

    const completionRate =
      firstImpressions != null && lastImpressions != null && firstImpressions > 0
        ? (lastImpressions / firstImpressions) * 100
        : null

    const totalReplies = seqSlides.reduce((sum, s) => sum + (s.replies ?? 0), 0)

    return {
      id:                      seq.id,
      name:                    seq.name,
      cta_type:                seq.cta_type as SequenceRow['cta_type'],
      correlated_dm_count:     seq.correlated_dm_count ?? 0,
      created_at:              seq.created_at,
      slide_count:             slideCount,
      first_slide_impressions: firstImpressions,
      completion_rate:         completionRate,
      total_replies:           totalReplies,
    }
  })

  return (
    <div>
      <PageHeader
        title="Stories"
        subtitle="Story performance and sequences. Sync regularly — stories expire after 24 hours."
      />
      <StoriesView stories={stories} sequences={sequences} />
    </div>
  )
}
