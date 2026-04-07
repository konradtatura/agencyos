-- ============================================================================
-- AgencyOS — Sprint 7: DM Inbox
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper: atomically increment unread_count on a conversation
-- Called from the webhook API route to avoid read-modify-write races.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_dm_unread(conv_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.dm_conversations
  SET    unread_count = unread_count + 1
  WHERE  id = conv_id;
$$;

-- ---------------------------------------------------------------------------
-- 1. dm_conversations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dm_conversations (
  id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id           uuid          NOT NULL REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
  ig_conversation_id   text          UNIQUE,
  ig_user_id           text          NOT NULL,
  ig_username          text,
  ig_profile_pic       text,
  assigned_setter_id   uuid          REFERENCES public.users(id) ON DELETE SET NULL,
  status               text          NOT NULL DEFAULT 'new'
                                     CHECK (status IN (
                                       'new','qualifying','qualified','disqualified',
                                       'booked','no_show','closed_won','closed_lost',
                                       'follow_up','nurture'
                                     )),
  story_sequence_id    uuid          REFERENCES public.story_sequences(id) ON DELETE SET NULL,
  post_id              uuid          REFERENCES public.instagram_posts(id) ON DELETE SET NULL,
  last_message_at      timestamptz,
  unread_count         integer       NOT NULL DEFAULT 0,
  created_at           timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dm_conversations_creator_last_msg_idx
  ON public.dm_conversations (creator_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS dm_conversations_ig_conversation_id_idx
  ON public.dm_conversations (ig_conversation_id);

-- ---------------------------------------------------------------------------
-- 2. dm_messages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dm_messages (
  id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id      uuid          NOT NULL REFERENCES public.dm_conversations(id) ON DELETE CASCADE,
  ig_message_id        text          UNIQUE,
  direction            text          NOT NULL CHECK (direction IN ('inbound','outbound')),
  message_text         text,
  sent_at              timestamptz   NOT NULL,
  sender_id            uuid          REFERENCES public.users(id) ON DELETE SET NULL,
  is_internal_note     boolean       NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS dm_messages_conversation_sent_at_idx
  ON public.dm_messages (conversation_id, sent_at ASC);

-- ---------------------------------------------------------------------------
-- RLS — dm_conversations
-- ---------------------------------------------------------------------------
ALTER TABLE public.dm_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dm_conversations: super_admin all"
  ON public.dm_conversations FOR ALL
  TO authenticated
  USING     (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Creator reads/updates their own conversations.
CREATE POLICY "dm_conversations: creator read own"
  ON public.dm_conversations FOR SELECT
  TO authenticated
  USING (
    creator_id IN (
      SELECT id FROM public.creator_profiles
      WHERE  user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "dm_conversations: creator update own"
  ON public.dm_conversations FOR UPDATE
  TO authenticated
  USING (
    creator_id IN (
      SELECT id FROM public.creator_profiles
      WHERE  user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    creator_id IN (
      SELECT id FROM public.creator_profiles
      WHERE  user_id = (SELECT auth.uid())
    )
  );

-- Setter reads conversations assigned to them OR unassigned, within their creator.
CREATE POLICY "dm_conversations: setter read"
  ON public.dm_conversations FOR SELECT
  TO authenticated
  USING (
    assigned_setter_id = (SELECT auth.uid())
    OR (
      assigned_setter_id IS NULL
      AND creator_id IN (
        SELECT creator_id FROM public.team_members
        WHERE  user_id = (SELECT auth.uid())
      )
    )
  );

-- Setter can update conversations assigned to them.
CREATE POLICY "dm_conversations: setter update assigned"
  ON public.dm_conversations FOR UPDATE
  TO authenticated
  USING     (assigned_setter_id = (SELECT auth.uid()))
  WITH CHECK (assigned_setter_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- RLS — dm_messages
-- ---------------------------------------------------------------------------
ALTER TABLE public.dm_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dm_messages: super_admin all"
  ON public.dm_messages FOR ALL
  TO authenticated
  USING     (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Readable if the user can read the parent conversation.
-- Mirrors the conversation policies: creator owns it OR setter is assigned/unassigned.
CREATE POLICY "dm_messages: read via conversation"
  ON public.dm_messages FOR SELECT
  TO authenticated
  USING (
    conversation_id IN (
      SELECT id FROM public.dm_conversations
      WHERE
        -- creator
        creator_id IN (
          SELECT id FROM public.creator_profiles
          WHERE  user_id = (SELECT auth.uid())
        )
        OR
        -- assigned setter
        assigned_setter_id = (SELECT auth.uid())
        OR
        -- unassigned setter for same creator
        (
          assigned_setter_id IS NULL
          AND creator_id IN (
            SELECT creator_id FROM public.team_members
            WHERE  user_id = (SELECT auth.uid())
          )
        )
    )
  );

-- Authenticated users who can read the conversation can also insert messages.
CREATE POLICY "dm_messages: insert via conversation"
  ON public.dm_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    conversation_id IN (
      SELECT id FROM public.dm_conversations
      WHERE
        creator_id IN (
          SELECT id FROM public.creator_profiles
          WHERE  user_id = (SELECT auth.uid())
        )
        OR assigned_setter_id = (SELECT auth.uid())
        OR (
          assigned_setter_id IS NULL
          AND creator_id IN (
            SELECT creator_id FROM public.team_members
            WHERE  user_id = (SELECT auth.uid())
          )
        )
    )
  );
