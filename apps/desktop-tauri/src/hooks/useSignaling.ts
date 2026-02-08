import { useEffect, useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

export interface ChatMessage {
  id: string;
  from_user_id: string;
  from_username: string;
  content: string;
  timestamp: number;
}

export interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice_candidate' | 'control_request' | 'control_grant' | 'control_revoke' | 'user_joined' | 'user_left' | 'chat_message';
  sdp?: string;
  candidate?: string;
  sdp_mid?: string | null;
  sdp_m_line_index?: number | null;
  from_user_id?: string;
  to_user_id?: string;
  user_id?: string;
  is_host?: boolean;
  // Chat message fields
  id?: string;
  from_username?: string;
  content?: string;
  timestamp?: number;
}

export interface UseSignalingOptions {
  sessionId: string;
  onOffer?: (sdp: string, fromUserId: string) => void;
  onAnswer?: (sdp: string, fromUserId: string) => void;
  onIceCandidate?: (candidate: string, sdpMid: string | null, sdpMLineIndex: number | null, fromUserId: string) => void;
  onControlRequest?: (fromUserId: string) => void;
  onControlGrant?: (toUserId: string) => void;
  onControlRevoke?: (toUserId: string) => void;
  onUserJoined?: (userId: string, isHost: boolean) => void;
  onUserLeft?: (userId: string) => void;
  onChatMessage?: (message: ChatMessage) => void;
}

export function useSignaling(options: UseSignalingOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Connect to signaling channel
  const connect = useCallback(async () => {
    try {
      setError(null);
      await invoke('connect_signaling', { sessionId: options.sessionId });
      setIsConnected(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setIsConnected(false);
    }
  }, [options.sessionId]);

  // Disconnect from signaling channel
  const disconnect = useCallback(async () => {
    try {
      await invoke('disconnect_signaling');
      setIsConnected(false);
    } catch (err) {
      console.error('Failed to disconnect signaling:', err);
    }
  }, []);

  // Send offer (host only)
  const sendOffer = useCallback(async (sdp: string) => {
    try {
      await invoke('send_offer', { sdp });
    } catch (err) {
      console.error('Failed to send offer:', err);
      throw err;
    }
  }, []);

  // Send answer (viewer only)
  const sendAnswer = useCallback(async (sdp: string) => {
    try {
      await invoke('send_answer', { sdp });
    } catch (err) {
      console.error('Failed to send answer:', err);
      throw err;
    }
  }, []);

  // Send ICE candidate
  const sendIceCandidate = useCallback(async (
    candidate: string,
    sdpMid: string | null,
    sdpMLineIndex: number | null
  ) => {
    try {
      await invoke('send_ice_candidate', {
        candidate,
        sdpMid,
        sdpMLineIndex,
      });
    } catch (err) {
      console.error('Failed to send ICE candidate:', err);
      throw err;
    }
  }, []);

  // Request control (viewer only)
  const requestControl = useCallback(async () => {
    try {
      await invoke('request_control');
    } catch (err) {
      console.error('Failed to request control:', err);
      throw err;
    }
  }, []);

  // Grant control (host only)
  const grantControl = useCallback(async (toUserId: string) => {
    try {
      await invoke('grant_control', { toUserId });
    } catch (err) {
      console.error('Failed to grant control:', err);
      throw err;
    }
  }, []);

  // Revoke control (host only)
  const revokeControl = useCallback(async (toUserId: string) => {
    try {
      await invoke('revoke_control', { toUserId });
    } catch (err) {
      console.error('Failed to revoke control:', err);
      throw err;
    }
  }, []);

  // Send chat message
  const sendChatMessage = useCallback(async (content: string): Promise<string> => {
    try {
      const messageId = await invoke<string>('send_chat_message', { content });
      return messageId;
    } catch (err) {
      console.error('Failed to send chat message:', err);
      throw err;
    }
  }, []);

  // Listen for signaling events
  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];

    const setupListeners = async () => {
      // Offer event
      if (options.onOffer) {
        const unlisten = await listen<SignalingMessage>('signaling:offer', (event) => {
          const { sdp, from_user_id } = event.payload;
          if (sdp && from_user_id) {
            options.onOffer!(sdp, from_user_id);
          }
        });
        unlisteners.push(unlisten);
      }

      // Answer event
      if (options.onAnswer) {
        const unlisten = await listen<SignalingMessage>('signaling:answer', (event) => {
          const { sdp, from_user_id } = event.payload;
          if (sdp && from_user_id) {
            options.onAnswer!(sdp, from_user_id);
          }
        });
        unlisteners.push(unlisten);
      }

      // ICE candidate event
      if (options.onIceCandidate) {
        const unlisten = await listen<SignalingMessage>('signaling:ice-candidate', (event) => {
          const { candidate, sdp_mid, sdp_m_line_index, from_user_id } = event.payload;
          if (candidate && from_user_id) {
            options.onIceCandidate!(candidate, sdp_mid ?? null, sdp_m_line_index ?? null, from_user_id);
          }
        });
        unlisteners.push(unlisten);
      }

      // Control request event
      if (options.onControlRequest) {
        const unlisten = await listen<SignalingMessage>('signaling:control-request', (event) => {
          const { from_user_id } = event.payload;
          if (from_user_id) {
            options.onControlRequest!(from_user_id);
          }
        });
        unlisteners.push(unlisten);
      }

      // Control grant event
      if (options.onControlGrant) {
        const unlisten = await listen<SignalingMessage>('signaling:control-grant', (event) => {
          const { to_user_id } = event.payload;
          if (to_user_id) {
            options.onControlGrant!(to_user_id);
          }
        });
        unlisteners.push(unlisten);
      }

      // Control revoke event
      if (options.onControlRevoke) {
        const unlisten = await listen<SignalingMessage>('signaling:control-revoke', (event) => {
          const { to_user_id } = event.payload;
          if (to_user_id) {
            options.onControlRevoke!(to_user_id);
          }
        });
        unlisteners.push(unlisten);
      }

      // User joined event
      if (options.onUserJoined) {
        const unlisten = await listen<SignalingMessage>('signaling:user-joined', (event) => {
          const { user_id, is_host } = event.payload;
          if (user_id !== undefined) {
            options.onUserJoined!(user_id, is_host ?? false);
          }
        });
        unlisteners.push(unlisten);
      }

      // User left event
      if (options.onUserLeft) {
        const unlisten = await listen<SignalingMessage>('signaling:user-left', (event) => {
          const { user_id } = event.payload;
          if (user_id) {
            options.onUserLeft!(user_id);
          }
        });
        unlisteners.push(unlisten);
      }

      // Chat message event
      if (options.onChatMessage) {
        const unlisten = await listen<SignalingMessage>('signaling:chat-message', (event) => {
          const { id, from_user_id, from_username, content, timestamp } = event.payload;
          if (id && from_user_id && from_username && content && timestamp) {
            options.onChatMessage!({
              id,
              from_user_id,
              from_username,
              content,
              timestamp,
            });
          }
        });
        unlisteners.push(unlisten);
      }
    };

    setupListeners();

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [options]);

  return {
    isConnected,
    error,
    connect,
    disconnect,
    sendOffer,
    sendAnswer,
    sendIceCandidate,
    requestControl,
    grantControl,
    revokeControl,
    sendChatMessage,
  };
}
