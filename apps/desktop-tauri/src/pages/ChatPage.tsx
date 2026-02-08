import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ArrowLeft } from "lucide-react";
import { ChatPanel } from "../components/chat/ChatPanel";

interface User {
  id: string;
  email: string;
}

export function ChatPage() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    invoke<User | null>("get_session")
      .then((session) => {
        if (session) {
          setUser(session);
        } else {
          navigate("/login");
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [navigate]);

  const handleConversationSelect = (id: string | null) => {
    if (id) {
      navigate(`/chat/${id}`, { replace: true });
    } else {
      navigate("/chat", { replace: true });
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex h-screen flex-col bg-slate-900">
      {/* Header */}
      <header className="flex items-center gap-4 border-b border-slate-700 bg-slate-800 px-4 py-3">
        <button
          onClick={() => navigate("/")}
          className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-lg font-semibold text-white">Team Chat</h1>
          <p className="text-xs text-slate-400">{user.email}</p>
        </div>
      </header>

      {/* Chat Panel */}
      <div className="flex-1 overflow-hidden">
        <ChatPanel
          currentUserId={user.id}
          selectedConversationId={conversationId}
          onConversationSelect={handleConversationSelect}
        />
      </div>
    </div>
  );
}
