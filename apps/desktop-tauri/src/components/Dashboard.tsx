import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { Monitor, Users, LogOut, Plus, ArrowRight, MessageSquare, Calendar } from "lucide-react";

interface DashboardProps {
  user: { id: string; email: string };
  onLogout: () => void;
}

interface CaptureSource {
  id: string;
  name: string;
  source_type: "screen" | "window";
  width: number;
  height: number;
  thumbnail: string | null;
}

export function Dashboard({ user, onLogout }: DashboardProps) {
  const navigate = useNavigate();
  const [sources, setSources] = useState<CaptureSource[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);

  const loadSources = async () => {
    setLoadingSources(true);
    try {
      const result = await invoke<CaptureSource[]>("get_sources");
      setSources(result);
    } catch (err) {
      console.error("Failed to get sources:", err);
    } finally {
      setLoadingSources(false);
    }
  };

  const createSession = async () => {
    setCreating(true);
    try {
      const session = await invoke<{ id: string; join_code: string }>(
        "create_session"
      );
      navigate(`/host/${session.id}`);
    } catch (err) {
      console.error("Failed to create session:", err);
    } finally {
      setCreating(false);
    }
  };

  const joinSession = async () => {
    if (!joinCode.trim()) return;
    setJoining(true);
    try {
      const session = await invoke<{ id: string }>("join_session", {
        joinCode: joinCode.trim().toUpperCase(),
      });
      navigate(`/view/${session.id}`);
    } catch (err) {
      console.error("Failed to join session:", err);
    } finally {
      setJoining(false);
    }
  };

  const handleLogout = async () => {
    try {
      await invoke("logout");
      onLogout();
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      {/* Header */}
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">SquadX Live</h1>
          <p className="text-slate-400">{user.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/calendar")}
            className="flex items-center gap-2 rounded-md px-4 py-2 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <Calendar size={18} />
            Agenda
          </button>
          <button
            onClick={() => navigate("/chat")}
            className="flex items-center gap-2 rounded-md px-4 py-2 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <MessageSquare size={18} />
            Chat
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-md px-4 py-2 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-4xl space-y-8">
        {/* Start Session Card */}
        <div className="rounded-lg bg-slate-800 p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-full bg-primary-500/20 p-2">
              <Monitor className="h-6 w-6 text-primary-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                Share Your Screen
              </h2>
              <p className="text-sm text-slate-400">
                Start a session and share your screen with others
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={loadSources}
              disabled={loadingSources}
              className="rounded-md bg-slate-700 px-4 py-2 text-white hover:bg-slate-600 disabled:opacity-50"
            >
              {loadingSources ? "Loading..." : "Select Screen"}
            </button>
            <button
              onClick={createSession}
              disabled={creating}
              className="flex items-center gap-2 rounded-md bg-primary-600 px-6 py-2 font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              <Plus size={18} />
              {creating ? "Creating..." : "Start Session"}
            </button>
          </div>

          {/* Source selection */}
          {sources.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-4">
              {sources.map((source) => (
                <button
                  key={source.id}
                  className="rounded-lg border border-slate-600 bg-slate-700 p-4 text-left transition hover:border-primary-500"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <Monitor size={16} className="text-slate-400" />
                    <span className="font-medium text-white">{source.name}</span>
                  </div>
                  <p className="text-sm text-slate-400">
                    {source.width} x {source.height}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Join Session Card */}
        <div className="rounded-lg bg-slate-800 p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-full bg-green-500/20 p-2">
              <Users className="h-6 w-6 text-green-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                Join a Session
              </h2>
              <p className="text-sm text-slate-400">
                Enter a code to view someone else's screen
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Enter join code"
              maxLength={6}
              className="w-48 rounded-md border border-slate-600 bg-slate-700 px-4 py-2 text-center text-lg font-mono tracking-wider text-white placeholder-slate-500 focus:border-primary-500 focus:outline-none"
            />
            <button
              onClick={joinSession}
              disabled={joining || !joinCode.trim()}
              className="flex items-center gap-2 rounded-md bg-green-600 px-6 py-2 font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {joining ? "Joining..." : "Join"}
              <ArrowRight size={18} />
            </button>
          </div>
        </div>

        {/* Team Chat Card */}
        <div className="rounded-lg bg-slate-800 p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-full bg-blue-500/20 p-2">
              <MessageSquare className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                Team Chat
              </h2>
              <p className="text-sm text-slate-400">
                Chat with your team members directly or in groups
              </p>
            </div>
          </div>

          <button
            onClick={() => navigate("/chat")}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-700"
          >
            <MessageSquare size={18} />
            Open Chat
          </button>
        </div>

        {/* Calendar Card */}
        <div className="rounded-lg bg-slate-800 p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-full bg-purple-500/20 p-2">
              <Calendar className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                Agenda
              </h2>
              <p className="text-sm text-slate-400">
                Agende reunioes e gerencie sua agenda de pair programming
              </p>
            </div>
          </div>

          <button
            onClick={() => navigate("/calendar")}
            className="flex items-center gap-2 rounded-md bg-purple-600 px-6 py-2 font-medium text-white hover:bg-purple-700"
          >
            <Calendar size={18} />
            Abrir Agenda
          </button>
        </div>
      </div>
    </div>
  );
}
