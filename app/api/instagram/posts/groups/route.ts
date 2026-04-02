/**
 * /api/instagram/posts/groups — Reel group management — Sprint 8.
 *
 * GET  → list all reel_groups for the authenticated creator
 *
 * POST with { action } body:
 *   { action: 'create',        name: string }
 *     → creates a new group, returns { group }
 *
 *   { action: 'rename',        group_id: string, name: string }
 *     → renames an existing group, returns { group }
 *
 *   { action: 'assign',        post_id: string, group_id: string | null }
 *     → sets (or clears) reel_group_id on a post
 *
 *   { action: 'ungroup_all',   group_id: string }
 *     → sets reel_group_id = null on all posts in the group, then deletes the group
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ── Auth / creator helper ─────────────────────────────────────────────────────

async function resolveCreator() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, creatorId: null }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('creator_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  return { user, creatorId: profile?.id ?? null, admin }
}

// ── GET — list groups ─────────────────────────────────────────────────────────

export async function GET() {
  const { creatorId, admin } = await resolveCreator()
  if (!creatorId || !admin) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { data: groups, error } = await admin
    .from('reel_groups')
    .select('id, name, created_at')
    .eq('creator_id', creatorId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ groups: groups ?? [] })
}

// ── POST — mutate groups ──────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { creatorId, admin } = await resolveCreator()
  if (!creatorId || !admin) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const body = await req.json() as Record<string, unknown>
  const action = body.action as string | undefined

  // ── create ──────────────────────────────────────────────────────────────────
  if (action === 'create') {
    const name = (body.name as string | undefined)?.trim()
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

    const { data: group, error } = await admin
      .from('reel_groups')
      .insert({ creator_id: creatorId, name })
      .select('id, name, created_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ group })
  }

  // ── rename ──────────────────────────────────────────────────────────────────
  if (action === 'rename') {
    const group_id = body.group_id as string | undefined
    const name     = (body.name as string | undefined)?.trim()
    if (!group_id || !name) {
      return NextResponse.json({ error: 'group_id and name are required' }, { status: 400 })
    }

    // Verify ownership
    const { data: existing } = await admin
      .from('reel_groups')
      .select('id')
      .eq('id', group_id)
      .eq('creator_id', creatorId)
      .single()

    if (!existing) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

    const { data: group, error } = await admin
      .from('reel_groups')
      .update({ name })
      .eq('id', group_id)
      .select('id, name, created_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ group })
  }

  // ── assign ──────────────────────────────────────────────────────────────────
  if (action === 'assign') {
    const post_id  = body.post_id  as string | undefined
    const group_id = body.group_id as string | null | undefined   // null = remove

    if (!post_id) return NextResponse.json({ error: 'post_id is required' }, { status: 400 })

    // Verify the post belongs to this creator
    const { data: post } = await admin
      .from('instagram_posts')
      .select('id')
      .eq('id', post_id)
      .eq('creator_id', creatorId)
      .single()

    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

    // If assigning to a group, verify the group belongs to this creator
    if (group_id) {
      const { data: grp } = await admin
        .from('reel_groups')
        .select('id')
        .eq('id', group_id)
        .eq('creator_id', creatorId)
        .single()

      if (!grp) return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }

    const { error } = await admin
      .from('instagram_posts')
      .update({ reel_group_id: group_id ?? null })
      .eq('id', post_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── ungroup_all ─────────────────────────────────────────────────────────────
  if (action === 'ungroup_all') {
    const group_id = body.group_id as string | undefined
    if (!group_id) return NextResponse.json({ error: 'group_id is required' }, { status: 400 })

    // Verify ownership
    const { data: existing } = await admin
      .from('reel_groups')
      .select('id')
      .eq('id', group_id)
      .eq('creator_id', creatorId)
      .single()

    if (!existing) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

    // Clear all posts in the group
    await admin
      .from('instagram_posts')
      .update({ reel_group_id: null })
      .eq('reel_group_id', group_id)

    // Delete the group (cascades to any remaining FK references if any)
    const { error } = await admin
      .from('reel_groups')
      .delete()
      .eq('id', group_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
}
