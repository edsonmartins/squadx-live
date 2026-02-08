import { useState, useEffect, useCallback } from "react";
import { Plus, Settings, ArrowLeft, Users, User, Circle } from "lucide-react";
import { useChat } from "../../hooks/useChat";
import { usePresence } from "../../hooks/usePresence";
import { ConversationList } from "./ConversationList";
import { MessageThread } from "./MessageThread";
import { MessageInput } from "./MessageInput";
import { CreateConversation } from "./CreateConversation";
import type { Conversation } from "../../types/chat";

interface ChatPanelProps {
  currentUserId: string;
  selectedConversationId?: string;
  onConversationSelect?: (conversationId: string | null) => void;
}

export function ChatPanel({
  currentUserId,
  selectedConversationId,
  onConversationSelect,
}: ChatPanelProps) {
  const {
    conversations,
    isConnected,
    isLoading,
    error,
    connect,
    loadConversations,
    loadMessages,
    sendMessage,
    createDirectConversation,
    createGroup,
    markAsRead,
    getTeamMembers,
    getConversationMessages,
  } = useChat();

  usePresence();

  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isMobileView, setIsMobileView] = useState(false);
  const [showConversationList, setShowConversationList] = useState(true);

  // Check for mobile view
  useEffect(() => {
    const checkMobile = () => setIsMobileView(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Connect to chat on mount
  useEffect(() => {
    connect();
    loadConversations();
  }, [connect, loadConversations]);

  // Load conversation if ID is provided
  useEffect(() => {
    if (selectedConversationId && conversations.length > 0) {
      const conv = conversations.find((c) => c.id === selectedConversationId);
      if (conv) {
        handleSelectConversation(conv);
      }
    }
  }, [selectedConversationId, conversations]);

  const handleSelectConversation = useCallback(
    async (conversation: Conversation) => {
      setSelectedConversation(conversation);
      onConversationSelect?.(conversation.id);

      if (isMobileView) {
        setShowConversationList(false);
      }

      // Load messages for this conversation
      await loadMessages(conversation.id);

      // Mark as read
      if (conversation.unread_count > 0) {
        await markAsRead(conversation.id);
      }
    },
    [isMobileView, loadMessages, markAsRead, onConversationSelect]
  );

  const handleBack = useCallback(() => {
    setShowConversationList(true);
    setSelectedConversation(null);
    onConversationSelect?.(null);
  }, [onConversationSelect]);

  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!selectedConversation) return;
      await sendMessage(selectedConversation.id, content);
    },
    [selectedConversation, sendMessage]
  );

  const handleCreateDirect = useCallback(
    async (userId: string) => {
      const conv = await createDirectConversation(userId);
      handleSelectConversation(conv);
    },
    [createDirectConversation, handleSelectConversation]
  );

  const handleCreateGroup = useCallback(
    async (name: string, memberIds: string[]) => {
      const conv = await createGroup({ name, member_ids: memberIds });
      handleSelectConversation(conv);
    },
    [createGroup, handleSelectConversation]
  );

  const getConversationName = (conv: Conversation) => {
    if (conv.type === "group") {
      return conv.name || "Unnamed Group";
    }
    const otherParticipant = conv.participants.find(
      (p) => p.user_id !== currentUserId
    );
    return otherParticipant?.display_name || "Unknown";
  };

  const getConversationAvatar = (conv: Conversation) => {
    if (conv.type === "group") {
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-600">
          <Users size={16} className="text-white" />
        </div>
      );
    }

    const otherParticipant = conv.participants.find(
      (p) => p.user_id !== currentUserId
    );

    if (otherParticipant?.avatar_url) {
      return (
        <img
          src={otherParticipant.avatar_url}
          alt={otherParticipant.display_name}
          className="h-8 w-8 rounded-full object-cover"
        />
      );
    }

    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-600">
        <User size={16} className="text-slate-300" />
      </div>
    );
  };

  const isParticipantOnline = (conv: Conversation) => {
    if (conv.type === "group") {
      return conv.participants.some(
        (p) => p.is_online && p.user_id !== currentUserId
      );
    }
    const otherParticipant = conv.participants.find(
      (p) => p.user_id !== currentUserId
    );
    return otherParticipant?.is_online ?? false;
  };

  const messages = selectedConversation
    ? getConversationMessages(selectedConversation.id)
    : [];

  // Mobile: show either list or thread
  if (isMobileView) {
    if (showConversationList || !selectedConversation) {
      return (
        <div className="flex h-full flex-col bg-slate-800">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
            <h2 className="text-lg font-semibold text-white">Messages</h2>
            <button
              onClick={() => setShowCreateModal(true)}
              className="rounded-lg bg-primary-600 p-2 text-white hover:bg-primary-700"
            >
              <Plus size={20} />
            </button>
          </div>

          {/* Connection status */}
          {!isConnected && (
            <div className="bg-yellow-900/50 px-4 py-2 text-sm text-yellow-200">
              Connecting to chat...
            </div>
          )}

          {error && (
            <div className="bg-red-900/50 px-4 py-2 text-sm text-red-200">
              {error}
            </div>
          )}

          {/* Conversations */}
          <ConversationList
            conversations={conversations}
            selectedId={selectedConversation?.id || null}
            onSelect={handleSelectConversation}
            currentUserId={currentUserId}
          />

          <CreateConversation
            isOpen={showCreateModal}
            onClose={() => setShowCreateModal(false)}
            onCreateDirect={handleCreateDirect}
            onCreateGroup={handleCreateGroup}
            getTeamMembers={getTeamMembers}
          />
        </div>
      );
    }

    // Show message thread
    return (
      <div className="flex h-full flex-col bg-slate-800">
        {/* Header with back button */}
        <div className="flex items-center gap-3 border-b border-slate-700 px-4 py-3">
          <button
            onClick={handleBack}
            className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="relative">
            {getConversationAvatar(selectedConversation)}
            {isParticipantOnline(selectedConversation) && (
              <Circle
                size={8}
                className="absolute -bottom-0.5 -right-0.5 fill-green-500 text-green-500"
              />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-white truncate">
              {getConversationName(selectedConversation)}
            </p>
            <p className="text-xs text-slate-400">
              {selectedConversation.participants.length} members
            </p>
          </div>
          <button className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white">
            <Settings size={20} />
          </button>
        </div>

        <MessageThread
          messages={messages}
          currentUserId={currentUserId}
          isLoading={isLoading}
        />

        <MessageInput onSend={handleSendMessage} disabled={!isConnected} />
      </div>
    );
  }

  // Desktop: side-by-side layout
  return (
    <div className="flex h-full bg-slate-800">
      {/* Sidebar */}
      <div className="flex w-80 flex-col border-r border-slate-700">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
          <h2 className="text-lg font-semibold text-white">Messages</h2>
          <button
            onClick={() => setShowCreateModal(true)}
            className="rounded-lg bg-primary-600 p-2 text-white hover:bg-primary-700"
          >
            <Plus size={20} />
          </button>
        </div>

        {/* Connection status */}
        {!isConnected && (
          <div className="bg-yellow-900/50 px-4 py-2 text-sm text-yellow-200">
            Connecting...
          </div>
        )}

        {/* Conversations */}
        <ConversationList
          conversations={conversations}
          selectedId={selectedConversation?.id || null}
          onSelect={handleSelectConversation}
          currentUserId={currentUserId}
        />
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        {selectedConversation ? (
          <>
            {/* Conversation header */}
            <div className="flex items-center gap-3 border-b border-slate-700 px-4 py-3">
              <div className="relative">
                {getConversationAvatar(selectedConversation)}
                {isParticipantOnline(selectedConversation) && (
                  <Circle
                    size={8}
                    className="absolute -bottom-0.5 -right-0.5 fill-green-500 text-green-500"
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-white truncate">
                  {getConversationName(selectedConversation)}
                </p>
                <p className="text-xs text-slate-400">
                  {selectedConversation.type === "group"
                    ? `${selectedConversation.participants.length} members`
                    : isParticipantOnline(selectedConversation)
                    ? "Online"
                    : "Offline"}
                </p>
              </div>
              <button className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white">
                <Settings size={20} />
              </button>
            </div>

            <MessageThread
              messages={messages}
              currentUserId={currentUserId}
              isLoading={isLoading}
            />

            <MessageInput onSend={handleSendMessage} disabled={!isConnected} />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <Users className="mx-auto h-16 w-16 text-slate-600 mb-4" />
              <p className="text-slate-400">Select a conversation to start chatting</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-4 rounded-lg bg-primary-600 px-4 py-2 text-white hover:bg-primary-700"
              >
                Start New Conversation
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="absolute bottom-4 right-4 rounded-lg bg-red-900 px-4 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <CreateConversation
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreateDirect={handleCreateDirect}
        onCreateGroup={handleCreateGroup}
        getTeamMembers={getTeamMembers}
      />
    </div>
  );
}
