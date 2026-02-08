import { Users, User, Circle } from "lucide-react";
import type { Conversation } from "../../types/chat";

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (conversation: Conversation) => void;
  currentUserId: string;
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  currentUserId,
}: ConversationListProps) {
  const getConversationName = (conv: Conversation) => {
    if (conv.type === "group") {
      return conv.name || "Unnamed Group";
    }
    // For direct conversations, show the other person's name
    const otherParticipant = conv.participants.find(
      (p) => p.user_id !== currentUserId
    );
    return otherParticipant?.display_name || "Unknown";
  };

  const getConversationAvatar = (conv: Conversation) => {
    if (conv.type === "group") {
      return (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-600">
          <Users size={20} className="text-white" />
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
          className="h-10 w-10 rounded-full object-cover"
        />
      );
    }

    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-600">
        <User size={20} className="text-slate-300" />
      </div>
    );
  };

  const isOnline = (conv: Conversation) => {
    if (conv.type === "group") {
      return conv.participants.some((p) => p.is_online && p.user_id !== currentUserId);
    }
    const otherParticipant = conv.participants.find(
      (p) => p.user_id !== currentUserId
    );
    return otherParticipant?.is_online ?? false;
  };

  const formatTime = (dateString?: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: "short" });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <Users className="h-12 w-12 text-slate-500 mb-3" />
        <p className="text-slate-400">No conversations yet</p>
        <p className="text-sm text-slate-500 mt-1">Start a new chat to begin</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {conversations.map((conv) => (
        <button
          key={conv.id}
          onClick={() => onSelect(conv)}
          className={`w-full flex items-center gap-3 p-3 hover:bg-slate-700 transition-colors text-left ${
            selectedId === conv.id ? "bg-slate-700" : ""
          }`}
        >
          <div className="relative">
            {getConversationAvatar(conv)}
            {isOnline(conv) && (
              <Circle
                size={10}
                className="absolute -bottom-0.5 -right-0.5 fill-green-500 text-green-500"
              />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="font-medium text-white truncate">
                {getConversationName(conv)}
              </span>
              {conv.last_message && (
                <span className="text-xs text-slate-500">
                  {formatTime(conv.last_message.created_at)}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between mt-0.5">
              <p className="text-sm text-slate-400 truncate">
                {conv.last_message?.content || "No messages yet"}
              </p>
              {conv.unread_count > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-600 px-1.5 text-xs font-medium text-white">
                  {conv.unread_count > 99 ? "99+" : conv.unread_count}
                </span>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
