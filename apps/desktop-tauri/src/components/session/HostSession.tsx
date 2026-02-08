import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { Copy, Check, Users, StopCircle, Settings, Shield, ShieldOff, MessageSquare } from "lucide-react";
import { useSignaling, ChatMessage } from "../../hooks/useSignaling";
import { useWebRTC } from "../../hooks/useWebRTC";
import { Chat } from "../chat/Chat";

interface SessionInfo {
  id: string;
  join_code: string;
  is_host: boolean;
  status: string;
}

interface Viewer {
  userId: string;
  hasControl: boolean;
}

export function HostSession() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [controlRequests, setControlRequests] = useState<string[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const pendingViewersRef = useRef<Set<string>>(new Set());

  // Ref to store signaling functions so we can use them in WebRTC callbacks
  const signalingRef = useRef<{
    sendOffer: (sdp: string) => Promise<void>;
    sendIceCandidate: (candidate: string, sdpMid: string | null, sdpMLineIndex: number | null) => Promise<void>;
  } | null>(null);

  // WebRTC callbacks - these will be used by useWebRTC
  const handleIceCandidateGenerated = useCallback((candidate: string, sdpMid: string | null, sdpMLineIndex: number | null) => {
    // Send ICE candidate via signaling
    if (signalingRef.current) {
      signalingRef.current.sendIceCandidate(candidate, sdpMid, sdpMLineIndex)
        .catch((err) => console.error("Failed to send ICE candidate:", err));
    }
  }, []);

  const handleOfferGenerated = useCallback((_sdp: string) => {
    // Send offer via signaling when viewers are connected
    console.log("Offer generated, will send when viewers connect");
  }, []);

  const handleDataChannelReady = useCallback((channel: RTCDataChannel) => {
    console.log("Data channel ready for input events:", channel.label);
    // Listen for input events from viewer
    channel.onmessage = (event) => {
      try {
        const inputEvent = JSON.parse(event.data);
        // Forward input event to Tauri backend for injection
        if (inputEvent.type === "mouse") {
          invoke("inject_mouse_event", inputEvent).catch(console.error);
        } else if (inputEvent.type === "keyboard") {
          invoke("inject_keyboard_event", inputEvent).catch(console.error);
        }
      } catch (err) {
        console.error("Failed to parse input event:", err);
      }
    };
  }, []);

  // Initialize WebRTC hook
  const webrtc = useWebRTC({
    isHost: true,
    onIceCandidate: handleIceCandidateGenerated,
    onOffer: handleOfferGenerated,
    onDataChannel: handleDataChannelReady,
  });

  // Signaling callbacks
  const handleUserJoined = useCallback((userId: string, isHost: boolean) => {
    if (!isHost) {
      setViewers((prev) => {
        if (prev.some((v) => v.userId === userId)) return prev;
        return [...prev, { userId, hasControl: false }];
      });
      // Mark this viewer as pending (waiting for offer)
      pendingViewersRef.current.add(userId);
    }
  }, []);

  const handleUserLeft = useCallback((userId: string) => {
    setViewers((prev) => prev.filter((v) => v.userId !== userId));
    setControlRequests((prev) => prev.filter((id) => id !== userId));
  }, []);

  const handleControlRequest = useCallback((fromUserId: string) => {
    setControlRequests((prev) => {
      if (prev.includes(fromUserId)) return prev;
      return [...prev, fromUserId];
    });
  }, []);

  const handleAnswer = useCallback((sdp: string, fromUserId: string) => {
    console.log("Received answer from:", fromUserId);
    webrtc.handleAnswer(sdp);
  }, [webrtc]);

  const handleIceCandidate = useCallback(
    (candidate: string, sdpMid: string | null, sdpMLineIndex: number | null, fromUserId: string) => {
      console.log("Received ICE candidate from:", fromUserId);
      webrtc.handleIceCandidate(candidate, sdpMid, sdpMLineIndex);
    },
    [webrtc]
  );

  const handleChatMessage = useCallback((message: ChatMessage) => {
    setChatMessages((prev) => [...prev, message]);
  }, []);

  // Initialize signaling
  const signaling = useSignaling({
    sessionId: sessionId || "",
    onUserJoined: handleUserJoined,
    onUserLeft: handleUserLeft,
    onControlRequest: handleControlRequest,
    onAnswer: handleAnswer,
    onIceCandidate: handleIceCandidate,
    onChatMessage: handleChatMessage,
  });

  useEffect(() => {
    // Get session info
    invoke<SessionInfo | null>("get_session_status")
      .then(setSession)
      .catch(console.error);

    // Get current user ID
    invoke<{ id: string }>("get_session")
      .then((user) => {
        if (user) setCurrentUserId(user.id);
      })
      .catch(console.error);

    // Start capture and WebRTC
    if (sessionId) {
      // Connect to signaling first
      signaling.connect();

      // Create WebRTC offer (which starts screen capture)
      webrtc.createOffer()
        .then(() => {
          setIsCapturing(true);
          console.log("Offer created, waiting for viewers...");
          // Offer will be sent when viewers join
        })
        .catch((err) => {
          console.error("Failed to create offer:", err);
        });
    }

    return () => {
      // Stop WebRTC and disconnect on unmount
      webrtc.close();
      signaling.disconnect();
    };
  }, [sessionId]);

  // Send offer when a new viewer joins and we have a local stream
  useEffect(() => {
    if (webrtc.localStream && pendingViewersRef.current.size > 0 && signaling.isConnected) {
      // Create and send offer to pending viewers
      const sendOfferToViewers = async () => {
        try {
          const pc = (webrtc as any).peerConnectionRef?.current;
          if (pc && pc.localDescription) {
            await signaling.sendOffer(pc.localDescription.sdp);
            console.log("Sent offer to viewers");
            pendingViewersRef.current.clear();
          }
        } catch (err) {
          console.error("Failed to send offer:", err);
        }
      };
      sendOfferToViewers();
    }
  }, [viewers, webrtc.localStream, signaling.isConnected]);

  // Display local stream preview
  useEffect(() => {
    if (videoPreviewRef.current && webrtc.localStream) {
      videoPreviewRef.current.srcObject = webrtc.localStream;
    }
  }, [webrtc.localStream]);

  // Wire signaling functions to ref so WebRTC callbacks can use them
  useEffect(() => {
    signalingRef.current = {
      sendOffer: signaling.sendOffer,
      sendIceCandidate: signaling.sendIceCandidate,
    };
  }, [signaling.sendOffer, signaling.sendIceCandidate]);

  const copyJoinCode = async () => {
    if (session?.join_code) {
      await navigator.clipboard.writeText(session.join_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const endSession = async () => {
    try {
      await signaling.disconnect();
      await invoke("end_session");
      navigate("/");
    } catch (err) {
      console.error("Failed to end session:", err);
    }
  };

  const handleGrantControl = async (userId: string) => {
    try {
      await signaling.grantControl(userId);
      setViewers((prev) =>
        prev.map((v) =>
          v.userId === userId ? { ...v, hasControl: true } : { ...v, hasControl: false }
        )
      );
      setControlRequests((prev) => prev.filter((id) => id !== userId));
      // Enable input injection
      await invoke("set_input_enabled", { enabled: true });
    } catch (err) {
      console.error("Failed to grant control:", err);
    }
  };

  const handleRevokeControl = async (userId: string) => {
    try {
      await signaling.revokeControl(userId);
      setViewers((prev) =>
        prev.map((v) => (v.userId === userId ? { ...v, hasControl: false } : v))
      );
      // Disable input injection
      await invoke("set_input_enabled", { enabled: false });
    } catch (err) {
      console.error("Failed to revoke control:", err);
    }
  };

  const handleSendChatMessage = async (content: string) => {
    const messageId = await signaling.sendChatMessage(content);
    // Add own message to the list (since we don't receive our own broadcasts)
    const timestamp = Date.now();
    setChatMessages((prev) => [
      ...prev,
      {
        id: messageId,
        from_user_id: currentUserId,
        from_username: "You",
        content,
        timestamp,
      },
    ]);
  };

  if (!session) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-slate-900">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-slate-700 bg-slate-800 px-4 py-3">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-white">Hosting Session</h1>
          <div className="flex items-center gap-2 rounded-md bg-slate-700 px-3 py-1.5">
            <span className="text-sm text-slate-400">Join Code:</span>
            <span className="font-mono text-lg font-bold tracking-wider text-white">
              {session.join_code}
            </span>
            <button
              onClick={copyJoinCode}
              className="ml-1 rounded p-1 text-slate-400 hover:bg-slate-600 hover:text-white"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
          {signaling.isConnected && (
            <div className="flex items-center gap-1 text-xs text-green-400">
              <div className="h-2 w-2 rounded-full bg-green-400" />
              Signaling connected
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-md bg-slate-700 px-3 py-1.5">
            <Users size={16} className="text-slate-400" />
            <span className="text-sm text-white">{viewers.length} viewers</span>
          </div>
          <button className="rounded-md p-2 text-slate-400 hover:bg-slate-700 hover:text-white">
            <Settings size={20} />
          </button>
          <button
            onClick={() => setIsChatOpen(!isChatOpen)}
            className="relative rounded-md p-2 text-slate-400 hover:bg-slate-700 hover:text-white"
          >
            <MessageSquare size={20} />
            {chatMessages.length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {chatMessages.length > 9 ? "9+" : chatMessages.length}
              </span>
            )}
          </button>
          <button
            onClick={endSession}
            className="flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-white hover:bg-red-700"
          >
            <StopCircle size={18} />
            End Session
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Screen preview */}
        <main className="flex flex-1 items-center justify-center p-8">
          <div className="relative aspect-video w-full max-w-4xl overflow-hidden rounded-lg border border-slate-700 bg-slate-800">
            {webrtc.localStream ? (
              <>
                <video
                  ref={videoPreviewRef}
                  autoPlay
                  muted
                  playsInline
                  className="h-full w-full object-contain"
                />
                {/* Recording indicator */}
                <div className="absolute top-4 left-4 flex items-center gap-2 rounded-md bg-red-600/90 px-3 py-1.5">
                  <div className="h-3 w-3 animate-pulse rounded-full bg-white" />
                  <span className="text-sm font-medium text-white">LIVE</span>
                </div>
                {/* Connection state */}
                <div className="absolute top-4 right-4 flex items-center gap-2 rounded-md bg-slate-800/90 px-3 py-1.5">
                  <div className={`h-2 w-2 rounded-full ${
                    webrtc.state.isConnected ? "bg-green-500" :
                    webrtc.state.connectionState === "connecting" ? "bg-yellow-500" :
                    "bg-slate-500"
                  }`} />
                  <span className="text-xs text-slate-300">
                    {webrtc.state.connectionState}
                  </span>
                </div>
              </>
            ) : isCapturing ? (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <div className="mb-4 h-4 w-4 animate-pulse rounded-full bg-red-500 mx-auto" />
                  <p className="text-lg font-medium text-white">
                    Screen is being shared
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    Viewers can see your screen
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent mx-auto" />
                  <p className="text-slate-400">Starting screen capture...</p>
                  <p className="mt-2 text-xs text-slate-500">
                    Please select a screen or window to share
                  </p>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Sidebar - Viewers and control requests */}
        {(viewers.length > 0 || controlRequests.length > 0) && (
          <aside className="w-72 border-l border-slate-700 bg-slate-800 p-4">
            {/* Control requests */}
            {controlRequests.length > 0 && (
              <div className="mb-6">
                <h3 className="mb-3 text-sm font-semibold text-slate-300">
                  Control Requests
                </h3>
                <div className="space-y-2">
                  {controlRequests.map((userId) => (
                    <div
                      key={userId}
                      className="flex items-center justify-between rounded-md bg-yellow-500/10 p-3"
                    >
                      <span className="text-sm text-yellow-400 truncate">
                        {userId.slice(0, 8)}...
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleGrantControl(userId)}
                          className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700"
                        >
                          Grant
                        </button>
                        <button
                          onClick={() =>
                            setControlRequests((prev) =>
                              prev.filter((id) => id !== userId)
                            )
                          }
                          className="rounded bg-slate-600 px-2 py-1 text-xs text-white hover:bg-slate-500"
                        >
                          Deny
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Viewers list */}
            <div>
              <h3 className="mb-3 text-sm font-semibold text-slate-300">
                Viewers ({viewers.length})
              </h3>
              <div className="space-y-2">
                {viewers.map((viewer) => (
                  <div
                    key={viewer.userId}
                    className="flex items-center justify-between rounded-md bg-slate-700 p-3"
                  >
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-primary-600 flex items-center justify-center text-xs text-white font-medium">
                        {viewer.userId.slice(0, 2).toUpperCase()}
                      </div>
                      <span className="text-sm text-white truncate max-w-[100px]">
                        {viewer.userId.slice(0, 8)}...
                      </span>
                    </div>
                    {viewer.hasControl ? (
                      <button
                        onClick={() => handleRevokeControl(viewer.userId)}
                        className="flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700"
                      >
                        <ShieldOff size={12} />
                        Revoke
                      </button>
                    ) : (
                      <button
                        onClick={() => handleGrantControl(viewer.userId)}
                        className="flex items-center gap-1 rounded bg-slate-600 px-2 py-1 text-xs text-white hover:bg-slate-500"
                      >
                        <Shield size={12} />
                        Grant
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Status bar */}
      <footer className="flex items-center justify-between border-t border-slate-700 bg-slate-800 px-4 py-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div
              className={`h-2 w-2 rounded-full ${
                signaling.isConnected ? "bg-green-500" : "bg-yellow-500"
              }`}
            />
            <span className="text-sm text-slate-400">
              {signaling.isConnected ? "Connected" : "Connecting..."}
            </span>
          </div>
          <span className="text-sm text-slate-500">Session ID: {sessionId}</span>
        </div>
        <div className="text-sm text-slate-500">
          {isCapturing ? "Sharing: Screen 1" : "Not sharing"}
        </div>
      </footer>

      {/* Chat */}
      <Chat
        messages={chatMessages}
        onSendMessage={handleSendChatMessage}
        currentUserId={currentUserId}
        isOpen={isChatOpen}
        onToggle={() => setIsChatOpen(!isChatOpen)}
      />
    </div>
  );
}
