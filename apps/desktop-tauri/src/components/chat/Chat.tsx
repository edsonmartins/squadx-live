import { useState, useRef, useEffect, useCallback } from "react";
import { Send, X, MessageSquare } from "lucide-react";
import type { ChatMessage } from "../../hooks/useSignaling";

interface ChatProps {
  messages: ChatMessage[];
  onSendMessage: (content: string) => Promise<void>;
  currentUserId: string;
  isOpen: boolean;
  onToggle: () => void;
}

export function Chat({ messages, onSendMessage, currentUserId, isOpen, onToggle }: ChatProps) {
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const content = inputValue.trim();
    if (!content || isSending) return;

    setIsSending(true);
    try {
      await onSendMessage(content);
      setInputValue("");
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setIsSending(false);
    }
  }, [inputValue, isSending, onSendMessage]);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed bottom-4 right-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary-600 text-white shadow-lg hover:bg-primary-700 transition-colors"
      >
        <MessageSquare size={24} />
        {messages.length > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold">
            {messages.length > 99 ? "99+" : messages.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 flex h-96 w-80 flex-col rounded-lg border border-slate-700 bg-slate-800 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageSquare size={18} className="text-primary-400" />
          <h3 className="font-semibold text-white">Chat</h3>
          <span className="text-xs text-slate-400">({messages.length})</span>
        </div>
        <button
          onClick={onToggle}
          className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white"
        >
          <X size={18} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-slate-500">No messages yet</p>
          </div>
        ) : (
          messages.map((message) => {
            const isOwnMessage = message.from_user_id === currentUserId;
            return (
              <div
                key={message.id}
                className={`flex flex-col ${isOwnMessage ? "items-end" : "items-start"}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-slate-400">
                    {isOwnMessage ? "You" : message.from_username.split("@")[0]}
                  </span>
                  <span className="text-xs text-slate-500">
                    {formatTime(message.timestamp)}
                  </span>
                </div>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 ${
                    isOwnMessage
                      ? "bg-primary-600 text-white"
                      : "bg-slate-700 text-slate-200"
                  }`}
                >
                  <p className="text-sm break-words">{message.content}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t border-slate-700 p-3">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            disabled={isSending}
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || isSending}
            className="flex items-center justify-center rounded-md bg-primary-600 px-3 py-2 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={18} />
          </button>
        </div>
      </form>
    </div>
  );
}
