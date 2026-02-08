import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, Unlink, RefreshCw, Calendar, CheckCircle, XCircle } from "lucide-react";

interface GoogleCalendarStatus {
  connected: boolean;
  email?: string;
  sync_enabled: boolean;
}

interface GoogleCalendarConnectProps {
  onStatusChange?: (status: GoogleCalendarStatus) => void;
}

export function GoogleCalendarConnect({ onStatusChange }: GoogleCalendarConnectProps) {
  const [status, setStatus] = useState<GoogleCalendarStatus>({
    connected: false,
    sync_enabled: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await invoke<GoogleCalendarStatus>("get_google_status");
      setStatus(result);
      onStatusChange?.(result);
    } catch (err) {
      console.error("Failed to get Google status:", err);
      setError("Erro ao verificar conexao");
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = async () => {
    try {
      setIsConnecting(true);
      setError(null);

      // Get OAuth URL
      const authUrl = await invoke<string>("start_google_auth");

      // Open in browser
      window.open(authUrl, "_blank");

      // Show instructions
      setError("Apos autorizar, cole o codigo aqui");

      // In a real implementation, you would:
      // 1. Use a custom URL scheme to receive the callback
      // 2. Or show a dialog for the user to paste the code
      // For now, we'll prompt for the code
      const code = prompt("Cole o codigo de autorizacao do Google:");

      if (code) {
        await invoke("complete_google_auth", { code: code.trim() });
        await loadStatus();
      }
    } catch (err) {
      console.error("Failed to connect Google:", err);
      setError(err instanceof Error ? err.message : "Erro ao conectar");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Deseja desconectar o Google Calendar?")) return;

    try {
      setIsDisconnecting(true);
      setError(null);
      await invoke("disconnect_google");
      setStatus({ connected: false, sync_enabled: false });
      onStatusChange?.({ connected: false, sync_enabled: false });
    } catch (err) {
      console.error("Failed to disconnect Google:", err);
      setError("Erro ao desconectar");
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleToggleSync = async () => {
    try {
      setError(null);
      const newEnabled = !status.sync_enabled;
      await invoke("toggle_google_sync", { enabled: newEnabled });
      const newStatus = { ...status, sync_enabled: newEnabled };
      setStatus(newStatus);
      onStatusChange?.(newStatus);
    } catch (err) {
      console.error("Failed to toggle sync:", err);
      setError("Erro ao alterar sincronizacao");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-slate-400">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-sm">Verificando conexao...</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-full ${status.connected ? "bg-green-500/20" : "bg-slate-700"}`}>
          <Calendar size={20} className={status.connected ? "text-green-400" : "text-slate-400"} />
        </div>
        <div className="flex-1">
          <h3 className="font-medium text-white">Google Calendar</h3>
          {status.connected ? (
            <p className="text-sm text-green-400 flex items-center gap-1">
              <CheckCircle size={12} />
              Conectado{status.email && ` - ${status.email}`}
            </p>
          ) : (
            <p className="text-sm text-slate-400 flex items-center gap-1">
              <XCircle size={12} />
              Nao conectado
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-3 p-2 rounded bg-red-900/30 border border-red-700 text-red-300 text-sm">
          {error}
        </div>
      )}

      {status.connected ? (
        <div className="space-y-3">
          {/* Sync toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-300">Sincronizar reunioes</span>
            <button
              onClick={handleToggleSync}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                status.sync_enabled ? "bg-primary-600" : "bg-slate-600"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  status.sync_enabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={loadStatus}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm bg-slate-700 text-slate-300 rounded hover:bg-slate-600"
            >
              <RefreshCw size={14} />
              Atualizar
            </button>
            <button
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm bg-red-600/20 text-red-400 rounded hover:bg-red-600/40 disabled:opacity-50"
            >
              {isDisconnecting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Unlink size={14} />
              )}
              Desconectar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={handleConnect}
          disabled={isConnecting}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white text-slate-900 rounded-lg hover:bg-slate-100 disabled:opacity-50"
        >
          {isConnecting ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <>
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Conectar Google Calendar
            </>
          )}
        </button>
      )}
    </div>
  );
}
