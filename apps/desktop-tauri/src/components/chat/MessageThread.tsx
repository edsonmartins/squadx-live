import { useRef, useEffect } from "react";
import { User } from "lucide-react";
import type { Message } from "../../types/chat";

interface MessageThreadProps {
  messages: Message[];
  currentUserId: string;
  isLoading?: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
}

export function MessageThread({
  messages,
  currentUserId,
  isLoading,
  onLoadMore,
  hasMore,
}: MessageThreadProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const formatTime = (dateString?: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return "Today";
    } else if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    }
    return date.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
  };

  // Group messages by date
  const groupedMessages = messages.reduce<{ date: string; messages: Message[] }[]>(
    (groups, message) => {
      const dateStr = message.created_at?.split("T")[0] || "Unknown";
      const lastGroup = groups[groups.length - 1];

      if (lastGroup && lastGroup.date === dateStr) {
        lastGroup.messages.push(message);
      } else {
        groups.push({ date: dateStr, messages: [message] });
      }

      return groups;
    },
    []
  );

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <p className="text-slate-400">No messages yet</p>
        <p className="text-sm text-slate-500 mt-1">Send a message to start the conversation</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto p-4">
      {hasMore && (
        <div className="flex justify-center mb-4">
          <button
            onClick={onLoadMore}
            disabled={isLoading}
            className="text-sm text-primary-400 hover:text-primary-300 disabled:opacity-50"
          >
            {isLoading ? "Loading..." : "Load more messages"}
          </button>
        </div>
      )}

      {groupedMessages.map((group) => (
        <div key={group.date}>
          {/* Date separator */}
          <div className="flex items-center gap-4 my-4">
            <div className="flex-1 h-px bg-slate-700" />
            <span className="text-xs text-slate-500 font-medium">
              {formatDate(group.messages[0]?.created_at)}
            </span>
            <div className="flex-1 h-px bg-slate-700" />
          </div>

          {/* Messages for this date */}
          <div className="space-y-3">
            {group.messages.map((message, index) => {
              const isOwnMessage = message.sender_id === currentUserId;
              const isSystem = message.message_type === "system";
              const showAvatar =
                !isOwnMessage &&
                !isSystem &&
                (index === 0 ||
                  group.messages[index - 1]?.sender_id !== message.sender_id);

              if (isSystem) {
                return (
                  <div key={message.id} className="flex justify-center">
                    <span className="text-xs text-slate-500 bg-slate-800 px-3 py-1 rounded-full">
                      {message.content}
                    </span>
                  </div>
                );
              }

              return (
                <div
                  key={message.id}
                  className={`flex gap-2 ${isOwnMessage ? "flex-row-reverse" : ""}`}
                >
                  {/* Avatar */}
                  <div className="w-8 flex-shrink-0">
                    {showAvatar && (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-600">
                        <User size={16} className="text-slate-300" />
                      </div>
                    )}
                  </div>

                  {/* Message bubble */}
                  <div
                    className={`flex flex-col max-w-[70%] ${
                      isOwnMessage ? "items-end" : "items-start"
                    }`}
                  >
                    {showAvatar && (
                      <span className="text-xs text-slate-400 mb-1 px-1">
                        {message.sender_name}
                      </span>
                    )}
                    <div
                      className={`rounded-lg px-3 py-2 ${
                        isOwnMessage
                          ? "bg-primary-600 text-white"
                          : "bg-slate-700 text-slate-200"
                      }`}
                    >
                      <p className="text-sm break-words whitespace-pre-wrap">
                        {message.content}
                      </p>
                    </div>
                    <span className="text-xs text-slate-500 mt-1 px-1">
                      {formatTime(message.created_at)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div ref={messagesEndRef} />
    </div>
  );
}
