// ==========================================
// Standalone Chat Types
// ==========================================

export interface Conversation {
  id: string;
  type: 'direct' | 'group';
  name?: string;
  avatar_url?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  participants: Participant[];
  last_message?: Message;
  unread_count: number;
}

export interface Participant {
  user_id: string;
  display_name: string;
  avatar_url?: string;
  role: 'admin' | 'member';
  is_online: boolean;
  last_seen_at?: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id?: string;
  sender_name: string;
  content: string;
  message_type: 'text' | 'system';
  created_at?: string;
}

export interface TeamMember {
  user_id: string;
  display_name: string;
  avatar_url?: string;
  is_online: boolean;
}

export type PresenceStatus = 'online' | 'away' | 'offline';

export interface ChatState {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  messages: Map<string, Message[]>;
  isConnected: boolean;
  isLoading: boolean;
}

export interface CreateGroupParams {
  name: string;
  member_ids: string[];
}
