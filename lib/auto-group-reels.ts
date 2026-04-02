/**
 * Auto-group reels by transcript similarity — Sprint 8.
 *
 * autoGroupReel(postId, creatorId)
 *   Called after a reel is successfully transcribed.
 *   Compares the new transcript against all other transcribed reels for
 *   the same creator.  If Jaccard similarity >= SIMILARITY_THRESHOLD:
 *     - If the matching reel already belongs to a group → add the new reel to it.
 *     - If not → create a new reel_group (named from the oldest reel's caption,
 *       truncated to 40 chars) and assign both reels to it.
 *   If no match is found the reel's reel_group_id stays null.
 *
 * Server-side only — never import in client-side code.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { jaccardSimilarity, SIMILARITY_THRESHOLD } from '@/lib/transcript-similarity'

export async function autoGroupReel(postId: string, creatorId: string): Promise<void> {
  const admin = createAdminClient()

  // ── 1. Fetch the newly transcribed reel's transcript ───────────────────────
  const { data: newTranscriptRow } = await admin
    .from('post_transcripts')
    .select('transcript_text')
    .eq('post_id', postId)
    .single()

  if (!newTranscriptRow?.transcript_text) return

  const newText = newTranscriptRow.transcript_text

  // ── 2. Fetch transcripts for all other reels by this creator ──────────────
  // Get post IDs for reels (VIDEO) by this creator that aren't the new one
  const { data: creatorReels } = await admin
    .from('instagram_posts')
    .select('id, caption, posted_at, reel_group_id')
    .eq('creator_id', creatorId)
    .eq('media_type', 'VIDEO')
    .neq('id', postId)

  if (!creatorReels?.length) return

  const otherIds = creatorReels.map((r) => r.id)

  const { data: otherTranscripts } = await admin
    .from('post_transcripts')
    .select('post_id, transcript_text')
    .in('post_id', otherIds)

  if (!otherTranscripts?.length) return

  // ── 3. Build lookup maps ───────────────────────────────────────────────────
  const transcriptMap = new Map<string, string>(
    otherTranscripts.map((t) => [t.post_id, t.transcript_text]),
  )
  const reelMeta = new Map(creatorReels.map((r) => [r.id, r]))

  // ── 4. Find best matching reel ─────────────────────────────────────────────
  let bestPostId: string | null = null
  let bestSim = 0

  for (const [pid, text] of Array.from(transcriptMap.entries())) {
    if (!text) continue
    const sim = jaccardSimilarity(newText, text)
    if (sim >= SIMILARITY_THRESHOLD && sim > bestSim) {
      bestSim = sim
      bestPostId = pid
    }
  }

  if (!bestPostId) return   // no similar reel found — leave ungrouped

  const matchedReel = reelMeta.get(bestPostId)
  if (!matchedReel) return

  // ── 5. Resolve or create group ─────────────────────────────────────────────
  let groupId: string

  if (matchedReel.reel_group_id) {
    // Join the existing group
    groupId = matchedReel.reel_group_id
  } else {
    // Create a new group; name it after the oldest reel's caption
    const { data: newPost } = await admin
      .from('instagram_posts')
      .select('caption, posted_at')
      .eq('id', postId)
      .single()

    const matchedAt = new Date(matchedReel.posted_at)
    const newAt     = newPost ? new Date(newPost.posted_at) : new Date()
    const oldestCaption = matchedAt <= newAt ? matchedReel.caption : (newPost?.caption ?? null)

    const groupName = oldestCaption
      ? oldestCaption.trim().slice(0, 40)
      : 'Untitled Group'

    const { data: created, error: createErr } = await admin
      .from('reel_groups')
      .insert({ creator_id: creatorId, name: groupName })
      .select('id')
      .single()

    if (createErr || !created) {
      console.error('[auto-group] failed to create reel_group', createErr)
      return
    }

    groupId = created.id

    // Assign the matched reel to the new group
    await admin
      .from('instagram_posts')
      .update({ reel_group_id: groupId })
      .eq('id', bestPostId)
  }

  // ── 6. Assign the new reel ─────────────────────────────────────────────────
  await admin
    .from('instagram_posts')
    .update({ reel_group_id: groupId })
    .eq('id', postId)

  console.info('[auto-group] assigned post', postId, '→ group', groupId, `(sim=${bestSim.toFixed(3)})`)
}
