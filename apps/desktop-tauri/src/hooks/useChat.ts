import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import type { Conversation, Message, TeamMember, CreateGroupParams } from "../types/chat";

export function useChat() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Map<string, Message[]>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Connect to chat realtime
  const connect = useCallback(async () => {
    try {
      setError(null);
      await invoke("connect_chat");
      setIsConnected(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      console.error("Failed to connect to chat:", err);
    }
  }, []);

  // Disconnect from chat realtime
  const disconnect = useCallback(async () => {
    try {
      await invoke("disconnect_chat");
      setIsConnected(false);
    } catch (err) {
      console.error("Failed to disconnect from chat:", err);
    }
  }, []);

  // Load all conversations
  const loadConversations = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const convs = await invoke<Conversation[]>("get_conversations");
      setConversations(convs);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      console.error("Failed to load conversations:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load messages for a conversation
  const loadMessages = useCallback(async (conversationId: string, limit?: number, before?: string) => {
    try {
      setError(null);
      const msgs = await invoke<Message[]>("get_messages", {
        conversationId,
        limit: limit || 50,
        before,
      });

      setMessages((prev) => {
        const updated = new Map(prev);
        const existing = updated.get(conversationId) || [];

        if (before) {
          // Prepend older messages
          updated.set(conversationId, [...msgs.reverse(), ...existing]);
        } else {
          // Replace with fresh messages
          updated.set(conversationId, msgs.reverse());
        }

        return updated;
      });

      return msgs;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      console.error("Failed to load messages:", err);
      return [];
    }
  }, []);

  // Send a message
  const sendMessage = useCallback(async (conversationId: string, content: string) => {
    try {
      setError(null);
      const message = await invoke<Message>("chat_send_message", {
        conversationId,
        content,
      });

      // Add message to local state
      setMessages((prev) => {
        const updated = new Map(prev);
        const existing = updated.get(conversationId) || [];
        updated.set(conversationId, [...existing, message]);
        return updated;
      });

      // Update conversation's last message
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === conversationId
            ? { ...conv, last_message: message, updated_at: message.created_at }
            : conv
        )
      );

      return message;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      console.error("Failed to send message:", err);
      throw err;
    }
  }, []);

  // Create a direct conversation
  const createDirectConversation = useCallback(async (otherUserId: string) => {
    try {
      setError(null);
      const conversation = await invoke<Conversation>("create_direct_conversation", {
        otherUserId,
      });

      setConversations((prev) => {
        // Check if already exists
        const exists = prev.some((c) => c.id === conversation.id);
        if (exists) return prev;
        return [conversation, ...prev];
      });

      return conversation;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      console.error("Failed to create conversation:", err);
      throw err;
    }
  }, []);

  // Create a group conversation
  const createGroup = useCallback(async (params: CreateGroupParams) => {
    try {
      setError(null);
      const conversation = await invoke<Conversation>("create_group_conversation", {
        name: params.name,
        memberIds: params.member_ids,
      });

      setConversations((prev) => [conversation, ...prev]);

      return conversation;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      console.error("Failed to create group:", err);
      throw err;
    }
  }, []);

  // Update a group
  const updateGroup = useCallback(async (conversationId: string, name?: string, avatarUrl?: string) => {
    try {
      setError(null);
      await invoke("update_group", {
        conversationId,
        name,
        avatarUrl,
      });

      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === conversationId
            ? { ...conv, name: name ?? conv.name, avatar_url: avatarUrl ?? conv.avatar_url }
            : conv
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      console.error("Failed to update group:", err);
      throw err;
    }
  }, []);

  // Add member to group
  const addGroupMember = useCallback(async (conversationId: string, userId: string) => {
    try {
      setError(null);
      await invoke("add_group_member", {
        conversationId,
        userId,
      });

      // Refresh conversation to get updated participants
      await loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      console.error("Failed to add member:", err);
      throw err;
    }
  }, [loadConversations]);

  // Remove member from group
  const removeGroupMember = useCallback(async (conversationId: string, userId: string) => {
    try {
      setError(null);
      await invoke("remove_group_member", {
        conversationId,
        userId,
      });

      // Refresh conversation to get updated participants
      await loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      console.error("Failed to remove member:", err);
      throw err;
    }
  }, [loadConversations]);

  // Leave a group
  const leaveGroup = useCallback(async (conversationId: string) => {
    try {
      setError(null);
      await invoke("leave_group", { conversationId });

      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      setMessages((prev) => {
        const updated = new Map(prev);
        updated.delete(conversationId);
        return updated;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      console.error("Failed to leave group:", err);
      throw err;
    }
  }, []);

  // Mark conversation as read
  const markAsRead = useCallback(async (conversationId: string) => {
    try {
      await invoke("mark_as_read", { conversationId });

      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === conversationId ? { ...conv, unread_count: 0 } : conv
        )
      );
    } catch (err) {
      console.error("Failed to mark as read:", err);
    }
  }, []);

  // Get team members
  const getTeamMembers = useCallback(async () => {
    try {
      setError(null);
      return await invoke<TeamMember[]>("get_team_members");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      console.error("Failed to get team members:", err);
      return [];
    }
  }, []);

  // Get messages for a specific conversation
  const getConversationMessages = useCallback(
    (conversationId: string) => messages.get(conversationId) || [],
    [messages]
  );

  // Listen for realtime events
  useEffect(() => {
    let unlistenNewMessage: UnlistenFn | undefined;
    let unlistenPresence: UnlistenFn | undefined;

    const setupListeners = async () => {
      unlistenNewMessage = await listen<Message>("chat:new-message", (event) => {
        const message = event.payload;

        setMessages((prev) => {
          const updated = new Map(prev);
          const existing = updated.get(message.conversation_id) || [];

          // Avoid duplicates
          if (existing.some((m) => m.id === message.id)) {
            return prev;
          }

          updated.set(message.conversation_id, [...existing, message]);
          return updated;
        });

        // Update conversation's last message and increment unread
        setConversations((prev) =>
          prev.map((conv) =>
            conv.id === message.conversation_id
              ? {
                  ...conv,
                  last_message: message,
                  updated_at: message.created_at,
                  unread_count: conv.unread_count + 1,
                }
              : conv
          )
        );
      });

      unlistenPresence = await listen("chat:presence-update", () => {
        // Refresh conversations to get updated presence
        loadConversations();
      });
    };

    setupListeners();

    return () => {
      unlistenNewMessage?.();
      unlistenPresence?.();
    };
  }, [loadConversations]);

  return {
    // State
    conversations,
    messages,
    isConnected,
    isLoading,
    error,

    // Actions
    connect,
    disconnect,
    loadConversations,
    loadMessages,
    sendMessage,
    createDirectConversation,
    createGroup,
    updateGroup,
    addGroupMember,
    removeGroupMember,
    leaveGroup,
    markAsRead,
    getTeamMembers,
    getConversationMessages,
  };
}
