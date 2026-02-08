import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { Hand, X, Maximize2, MessageSquare } from "lucide-react";
import { useSignaling, ChatMessage } from "../../hooks/useSignaling";
import { useWebRTC } from "../../hooks/useWebRTC";
import { Chat } from "../chat/Chat";

interface SessionInfo {
  id: string;
  join_code: string;
  is_host: boolean;
  status: string;
}

export function ViewSession() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [hasControl, setHasControl] = useState(false);
  const [requestingControl, setRequestingControl] = useState(false);
  const [hostConnected, setHostConnected] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Ref to store signaling functions so we can use them in WebRTC callbacks
  const signalingRef = useRef<{
    sendAnswer: (sdp: string) => Promise<void>;
    sendIceCandidate: (candidate: string, sdpMid: string | null, sdpMLineIndex: number | null) => Promise<void>;
  } | null>(null);

  // WebRTC callbacks
  const handleIceCandidateGenerated = useCallback((candidate: string, sdpMid: string | null, sdpMLineIndex: number | null) => {
    // Send ICE candidate via signaling
    if (signalingRef.current) {
      signalingRef.current.sendIceCandidate(candidate, sdpMid, sdpMLineIndex)
        .catch((err) => console.error("Failed to send ICE candidate:", err));
    }
  }, []);

  const handleAnswerGenerated = useCallback((sdp: string) => {
    // Send answer via signaling
    if (signalingRef.current) {
      signalingRef.current.sendAnswer(sdp)
        .then(() => console.log("Answer sent"))
        .catch((err) => console.error("Failed to send answer:", err));
    }
  }, []);

  const handleRemoteStream = useCallback((stream: MediaStream) => {
    console.log("Received remote stream");
    setRemoteStream(stream);
  }, []);

  const handleDataChannelReady = useCallback((channel: RTCDataChannel) => {
    console.log("Data channel received:", channel.label);
    // We can send input events through this channel when we have control
  }, []);

  // Initialize WebRTC hook
  const webrtc = useWebRTC({
    isHost: false,
    onIceCandidate: handleIceCandidateGenerated,
    onAnswer: handleAnswerGenerated,
    onRemoteStream: handleRemoteStream,
    onDataChannel: handleDataChannelReady,
  });

  // Signaling callbacks
  const handleUserJoined = useCallback((_userId: string, isHost: boolean) => {
    if (isHost) {
      setHostConnected(true);
    }
  }, []);

  const handleUserLeft = useCallback((_userId: string) => {
    // If host left, we should leave too
    // TODO: Navigate back to dashboard
  }, []);

  const handleControlGrant = useCallback((toUserId: string) => {
    // Check if we received control
    invoke<{ id: string }>("get_session")
      .then((user) => {
        if (user && toUserId === user.id) {
          setHasControl(true);
          setRequestingControl(false);
          invoke("set_input_enabled", { enabled: true });
        }
      })
      .catch(console.error);
  }, []);

  const handleControlRevoke = useCallback((toUserId: string) => {
    invoke<{ id: string }>("get_session")
      .then((user) => {
        if (user && toUserId === user.id) {
          setHasControl(false);
          invoke("set_input_enabled", { enabled: false });
        }
      })
      .catch(console.error);
  }, []);

  const handleOffer = useCallback((sdp: string, fromUserId: string) => {
    console.log("Received offer from host:", fromUserId);
    // Set remote description and create answer
    webrtc.handleOffer(sdp);
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
    onControlGrant: handleControlGrant,
    onControlRevoke: handleControlRevoke,
    onChatMessage: handleChatMessage,
    onOffer: handleOffer,
    onIceCandidate: handleIceCandidate,
  });

  useEffect(() => {
    invoke<SessionInfo | null>("get_session_status")
      .then(setSession)
      .catch(console.error);

    // Get current user ID
    invoke<{ id: string }>("get_session")
      .then((user) => {
        if (user) setCurrentUserId(user.id);
      })
      .catch(console.error);

    if (sessionId) {
      // Connect to signaling
      signaling.connect();
    }

    return () => {
      signaling.disconnect();
      webrtc.close();
    };
  }, [sessionId]);

  // Wire signaling functions to ref so WebRTC callbacks can use them
  useEffect(() => {
    signalingRef.current = {
      sendAnswer: signaling.sendAnswer,
      sendIceCandidate: signaling.sendIceCandidate,
    };
  }, [signaling.sendAnswer, signaling.sendIceCandidate]);

  // Display remote stream in video element
  useEffect(() => {
    if (videoRef.current && remoteStream) {
      videoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Send input events when we have control
  const sendInputEvent = useCallback((event: MouseEvent | KeyboardEvent) => {
    if (!hasControl || !webrtc.dataChannel) return;

    const channel = webrtc.dataChannel;
    if (channel.readyState !== "open") return;

    if (event instanceof MouseEvent) {
      // Get mouse position relative to video element
      const video = videoRef.current;
      if (!video) return;

      const rect = video.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;

      const inputEvent = {
        type: "mouse",
        event_type: event.type,
        x,
        y,
        button: event.button,
      };
      channel.send(JSON.stringify(inputEvent));
    } else if (event instanceof KeyboardEvent) {
      const inputEvent = {
        type: "keyboard",
        event_type: event.type,
        key: event.key,
        ctrl: event.ctrlKey,
        alt: event.altKey,
        shift: event.shiftKey,
        meta: event.metaKey,
      };
      channel.send(JSON.stringify(inputEvent));
    }
  }, [hasControl, webrtc.dataChannel]);

  // Attach input event listeners when we have control
  useEffect(() => {
    if (!hasControl || !containerRef.current) return;

    const container = containerRef.current;
    const handleMouseEvent = (e: MouseEvent) => sendInputEvent(e);
    const handleKeyEvent = (e: KeyboardEvent) => sendInputEvent(e);

    container.addEventListener("mousedown", handleMouseEvent);
    container.addEventListener("mouseup", handleMouseEvent);
    container.addEventListener("mousemove", handleMouseEvent);
    container.addEventListener("click", handleMouseEvent);
    container.addEventListener("dblclick", handleMouseEvent);
    container.addEventListener("contextmenu", handleMouseEvent);
    window.addEventListener("keydown", handleKeyEvent);
    window.addEventListener("keyup", handleKeyEvent);

    return () => {
      container.removeEventListener("mousedown", handleMouseEvent);
      container.removeEventListener("mouseup", handleMouseEvent);
      container.removeEventListener("mousemove", handleMouseEvent);
      container.removeEventListener("click", handleMouseEvent);
      container.removeEventListener("dblclick", handleMouseEvent);
      container.removeEventListener("contextmenu", handleMouseEvent);
      window.removeEventListener("keydown", handleKeyEvent);
      window.removeEventListener("keyup", handleKeyEvent);
    };
  }, [hasControl, sendInputEvent]);

  const requestControl = async () => {
    setRequestingControl(true);
    try {
      await signaling.requestControl();
      // Wait for grant from host - handled by handleControlGrant
    } catch (err) {
      console.error("Failed to request control:", err);
      setRequestingControl(false);
    }
  };

  const releaseControl = async () => {
    setHasControl(false);
    await invoke("set_input_enabled", { enabled: false });
  };

  const leaveSession = async () => {
    try {
      await signaling.disconnect();
      await invoke("end_session");
    } catch (err) {
      console.error("Failed to leave session:", err);
    }
    navigate("/");
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
          <h1 className="text-lg font-semibold text-white">Viewing Session</h1>
          <span className="rounded-md bg-slate-700 px-3 py-1 text-sm text-slate-300">
            {session.join_code}
          </span>
          {signaling.isConnected && (
            <div className="flex items-center gap-1 text-xs text-green-400">
              <div className="h-2 w-2 rounded-full bg-green-400" />
              Connected
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {hasControl ? (
            <button
              onClick={releaseControl}
              className="flex items-center gap-2 rounded-md bg-amber-600 px-4 py-2 text-white hover:bg-amber-700"
            >
              <Hand size={18} />
              Release Control
            </button>
          ) : (
            <button
              onClick={requestControl}
              disabled={requestingControl}
              className="flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-white hover:bg-primary-700 disabled:opacity-50"
            >
              <Hand size={18} />
              {requestingControl ? "Requesting..." : "Request Control"}
            </button>
          )}
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
          <button className="rounded-md p-2 text-slate-400 hover:bg-slate-700 hover:text-white">
            <Maximize2 size={20} />
          </button>
          <button
            onClick={leaveSession}
            className="rounded-md p-2 text-red-400 hover:bg-slate-700 hover:text-red-300"
          >
            <X size={20} />
          </button>
        </div>
      </header>

      {/* Main content - Remote screen */}
      <main className="flex flex-1 items-center justify-center bg-black p-4">
        <div
          ref={containerRef}
          className={`relative aspect-video w-full max-w-6xl overflow-hidden rounded-lg border border-slate-700 bg-slate-900 ${
            hasControl ? "cursor-pointer" : ""
          }`}
          tabIndex={hasControl ? 0 : undefined}
        >
          {remoteStream ? (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="h-full w-full object-contain"
              />
              {/* Connection state overlay */}
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
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                {webrtc.state.connectionState === "connecting" ? (
                  <>
                    <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent mx-auto" />
                    <p className="text-lg font-medium text-white">
                      Connecting to remote screen...
                    </p>
                    <p className="mt-2 text-sm text-slate-400">
                      Establishing WebRTC connection
                    </p>
                  </>
                ) : hostConnected ? (
                  <>
                    <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent mx-auto" />
                    <p className="text-lg font-medium text-white">
                      Waiting for stream...
                    </p>
                    <p className="mt-2 text-sm text-slate-400">
                      Host is connected, waiting for video
                    </p>
                  </>
                ) : (
                  <>
                    <div className="mb-4 h-8 w-8 rounded-full bg-slate-700 mx-auto flex items-center justify-center">
                      <div className="h-4 w-4 rounded-full bg-slate-600" />
                    </div>
                    <p className="text-lg font-medium text-white">
                      Waiting for host...
                    </p>
                    <p className="mt-2 text-sm text-slate-400">
                      The host will start sharing their screen soon
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Control indicator */}
          {hasControl && (
            <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-md bg-green-600/90 px-3 py-1.5">
              <Hand size={16} />
              <span className="text-sm font-medium text-white">
                You have control - click and type to interact
              </span>
            </div>
          )}

          {/* Requesting control indicator */}
          {requestingControl && (
            <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-md bg-yellow-600/90 px-3 py-1.5">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
              <span className="text-sm font-medium text-white">
                Waiting for host approval...
              </span>
            </div>
          )}
        </div>
      </main>

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
          {signaling.error && (
            <span className="text-sm text-red-400">{signaling.error}</span>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm text-slate-500">
          <span>WebRTC: {webrtc.state.connectionState}</span>
          <span>ICE: {webrtc.state.iceConnectionState}</span>
          <span>{webrtc.state.hasRemoteStream ? "Streaming" : "No stream"}</span>
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
