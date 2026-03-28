/**
 * AI content analysis service — Sprint 4.
 *
 * analyzeContent(creatorId):
 *   1. Fetch the last 20 transcribed reels + their metrics from Supabase
 *   2. Build a prompt with each transcript + performance numbers
 *   3. Send to Claude Opus with adaptive thinking + structured JSON output
 *   4. Persist the result in content_analyses
 *   5. Return the typed analysis object
 *
 * Server-side only.
 */

import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'

// ── Output schema ─────────────────────────────────────────────────────────────

const TopicSchema = z.object({
  topic:           z.string().describe('The content topic or theme'),
  avg_engagement:  z.number().describe('Average engagement rate as a percentage'),
  post_count:      z.number().describe('Number of posts covering this topic'),
})

const UnderperformingTopicSchema = z.object({
  topic:          z.string().describe('The content topic or theme'),
  avg_engagement: z.number().describe('Average engagement rate as a percentage'),
})

const HookAnalysisSchema = z.object({
  best_hooks:  z.array(z.string()).describe('Verbatim opening lines from top-performing reels'),
  worst_hooks: z.array(z.string()).describe('Verbatim opening lines from lowest-performing reels'),
  pattern:     z.string().describe('A 1–2 sentence synthesis of what makes the best hooks work'),
})

const RecommendationSchema = z.object({
  title:      z.string().describe('Short title for the content idea'),
  hook:       z.string().describe('Suggested opening line that grabs attention in under 3 seconds'),
  format:     z.string().describe('Recommended format (e.g. "Tutorial", "Story", "POV", "List reel")'),
  why:        z.string().describe('Why this will likely perform well given the creator\'s data'),
  difficulty: z.enum(['Easy', 'Medium', 'Hard']).describe('Implementation difficulty: Easy (minimal prep), Medium (some preparation), Hard (significant effort or resources)'),
})

export const ContentAnalysisSchema = z.object({
  top_topics:               z.array(TopicSchema).describe('Topics with above-average engagement, ranked best first'),
  underperforming_topics:   z.array(UnderperformingTopicSchema).describe('Topics that consistently underperform'),
  hook_analysis:            HookAnalysisSchema,
  content_pillars:          z.array(z.string()).describe('3–5 recurring themes that define this creator\'s content'),
  recommendations:          z.array(RecommendationSchema).min(5).max(5).describe('Exactly 5 data-driven content recommendations'),
  overall_score:            z.number().min(1).max(10).describe('Overall content strategy score from 1 to 10'),
  summary:                  z.string().describe('2–3 sentence overall assessment of the creator\'s content performance'),
  optimal_length:           z.string().describe('Recommended reel length range based on performance data, e.g. "45–60 seconds: reels in this range had 28% higher watch rates in your data"'),
})

export type ContentAnalysis = z.infer<typeof ContentAnalysisSchema>

// ── Metric helpers ────────────────────────────────────────────────────────────

function engagementRate(
  reach: number | null,
  likes: number | null,
  comments: number | null,
  saves: number | null,
  shares: number | null,
): number | null {
  if (!reach) return null
  const interactions = (likes ?? 0) + (comments ?? 0) + (saves ?? 0) + (shares ?? 0)
  return (interactions / reach) * 100
}

function watchRate(reach: number | null, views: number | null): number | null {
  if (!reach || views == null) return null
  return (views / reach) * 100
}

function fmt(n: number | null): string {
  if (n == null) return 'N/A'
  return n.toFixed(1)
}

// ── Client ────────────────────────────────────────────────────────────────────

function getAnthropic(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY')
  return new Anthropic({ apiKey })
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AnalyzeResult {
  success:   true
  analysis:  ContentAnalysis
  postCount: number
}

export interface AnalyzeError {
  success: false
  error:   string
}

export type AnalyzeOutcome = AnalyzeResult | AnalyzeError

// ── Core function ─────────────────────────────────────────────────────────────

export async function analyzeContent(creatorId: string): Promise<AnalyzeOutcome> {
  const admin = createAdminClient()

  // ── 1. Fetch last 20 transcribed reels ─────────────────────────────────────

  const { data: posts, error: postsError } = await admin
    .from('instagram_posts')
    .select('id, caption, posted_at')
    .eq('creator_id', creatorId)
    .eq('media_type', 'VIDEO')
    .eq('transcript_status', 'done')
    .order('posted_at', { ascending: false })
    .limit(20)

  if (postsError) {
    return { success: false, error: `Failed to fetch posts: ${postsError.message}` }
  }

  if (!posts || posts.length === 0) {
    return { success: false, error: 'No transcribed reels found. Transcribe at least one reel first.' }
  }

  const postIds = posts.map((p) => p.id)

  // ── Transcripts ────────────────────────────────────────────────────────────

  const { data: transcripts, error: transcriptError } = await admin
    .from('post_transcripts')
    .select('post_id, transcript_text')
    .in('post_id', postIds)

  if (transcriptError) {
    return { success: false, error: `Failed to fetch transcripts: ${transcriptError.message}` }
  }

  const transcriptMap = new Map<string, string>(
    (transcripts ?? []).map((t) => [t.post_id, t.transcript_text]),
  )

  // ── Metrics (latest per post) ──────────────────────────────────────────────

  const { data: rawMetrics, error: metricsError } = await admin
    .from('instagram_post_metrics')
    .select('post_id, reach, views, like_count, comments_count, saved, shares, synced_at')
    .in('post_id', postIds)
    .order('synced_at', { ascending: false })

  if (metricsError) {
    return { success: false, error: `Failed to fetch metrics: ${metricsError.message}` }
  }

  // Deduplicate — first row per post_id is the latest sync
  const metricsMap = new Map<string, {
    reach: number | null; views: number | null; like_count: number | null
    comments_count: number | null; saved: number | null; shares: number | null
  }>()
  for (const m of rawMetrics ?? []) {
    if (!metricsMap.has(m.post_id)) metricsMap.set(m.post_id, m)
  }

  // ── 2. Build prompt ────────────────────────────────────────────────────────

  const reelBlocks = posts.map((post, i) => {
    const transcript = transcriptMap.get(post.id) ?? '(no transcript)'
    const m         = metricsMap.get(post.id)
    const eng        = engagementRate(m?.reach ?? null, m?.like_count ?? null, m?.comments_count ?? null, m?.saved ?? null, m?.shares ?? null)
    const watch      = watchRate(m?.reach ?? null, m?.views ?? null)
    const date       = new Date(post.posted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

    return `
--- REEL ${i + 1} (${date}) ---
Caption: ${post.caption ?? '(none)'}
Views: ${m?.views ?? 'N/A'}  |  Reach: ${m?.reach ?? 'N/A'}  |  Likes: ${m?.like_count ?? 'N/A'}
Comments: ${m?.comments_count ?? 'N/A'}  |  Saves: ${m?.saved ?? 'N/A'}  |  Shares: ${m?.shares ?? 'N/A'}
Engagement Rate: ${fmt(eng)}%  |  Watch Rate: ${fmt(watch)}%
Transcript Length: ${transcript.trim().split(/\s+/).filter(Boolean).length} words

HOOK (first 2 sentences):
${transcript.trim().split(/[.!?]+/).slice(0, 2).join('. ').trim()}

FULL TRANSCRIPT:
${transcript.trim()}
`.trim()
  }).join('\n\n')

  const userPrompt = `
Here are the last ${posts.length} transcribed reels for this creator along with their performance metrics.
Analyze the content strategy and return a structured JSON analysis.

${reelBlocks}
`.trim()

  // ── 3. Call Claude ─────────────────────────────────────────────────────────

  const anthropic = getAnthropic()

  let analysis: ContentAnalysis

  try {
    const response = await anthropic.messages.parse({
      model:     'claude-opus-4-6',
      max_tokens: 8192,
      thinking:  { type: 'adaptive' },
      system: `You are an elite content strategist and data analyst specializing in short-form video performance.
Your job is to analyze a creator's reel transcripts alongside their engagement metrics to surface actionable insights.

Focus on:
- What topics and formats drive the highest engagement and watch rates
- The EXACT hook structure of top-performing reels — extract and analyze the first 1–2 sentences of their transcripts
- A direct comparison of the hooks used in the TOP 5 vs BOTTOM 5 reels by engagement
- Optimal reel length: correlate transcript word count with engagement/watch rate to identify the ideal length range
- Underperforming content patterns to avoid
- Data-driven content recommendations tailored to THIS creator's voice and audience, each with a difficulty score (Easy/Medium/Hard)

Be specific and direct. Reference actual data from the transcripts and numbers in your analysis.
Do not hedge with "it depends" — give clear, prioritized recommendations.
Return strict JSON only — no prose, no markdown, no explanation outside the JSON structure.`,
      messages: [{ role: 'user', content: userPrompt }],
      output_config: {
        format: zodOutputFormat(ContentAnalysisSchema),
      },
    })

    if (!response.parsed_output) {
      return { success: false, error: 'Claude returned an empty or unparseable analysis.' }
    }

    analysis = response.parsed_output
  } catch (err) {
    const message = err instanceof Anthropic.APIError
      ? `Claude API error ${err.status}: ${err.message}`
      : err instanceof Error ? err.message : String(err)
    console.error('[content-analyzer] Claude call failed', message)
    return { success: false, error: message }
  }

  // ── 4. Persist to content_analyses ────────────────────────────────────────

  const { error: insertError } = await admin
    .from('content_analyses')
    .insert({
      creator_id:    creatorId,
      platform:      'instagram',
      analysis_json: analysis,
      post_count:    posts.length,
    })

  if (insertError) {
    // Non-fatal — log but still return the analysis
    console.error('[content-analyzer] Failed to persist analysis', insertError.message)
  }

  return { success: true, analysis, postCount: posts.length }
}
