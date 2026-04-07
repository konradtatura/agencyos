export type ConversationStatus =
  | 'new'
  | 'qualifying'
  | 'qualified'
  | 'disqualified'
  | 'booked'
  | 'no_show'
  | 'closed_won'
  | 'closed_lost'
  | 'follow_up'
  | 'nurture'

export interface DmConversation {
  id: string
  creator_id: string
  ig_conversation_id: string | null
  ig_user_id: string
  ig_username: string | null
  ig_profile_pic: string | null
  assigned_setter_id: string | null
  status: ConversationStatus
  story_sequence_id: string | null
  post_id: string | null
  last_message_at: string | null
  unread_count: number
  created_at: string
}

export interface DmMessage {
  id: string
  conversation_id: string
  ig_message_id: string | null
  direction: 'inbound' | 'outbound'
  message_text: string | null
  sent_at: string
  sender_id: string | null
  is_internal_note: boolean
}

export interface TeamMember {
  id: string
  full_name: string | null
  email: string | null
  role: string
}
