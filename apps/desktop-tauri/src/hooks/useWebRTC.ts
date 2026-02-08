import { useCallback, useRef, useState, useEffect } from 'react';

// ICE servers configuration
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // Add TURN server if configured
    ...(import.meta.env.VITE_TURN_SERVER_URL
      ? [
          {
            urls: import.meta.env.VITE_TURN_SERVER_URL,
            username: import.meta.env.VITE_TURN_SERVER_USERNAME || '',
            credential: import.meta.env.VITE_TURN_SERVER_CREDENTIAL || '',
          },
        ]
      : []),
  ],
  iceCandidatePoolSize: 10,
};

export interface WebRTCState {
  connectionState: RTCPeerConnectionState | 'new';
  iceConnectionState: RTCIceConnectionState | 'new';
  isConnected: boolean;
  hasRemoteStream: boolean;
  error: string | null;
}

export interface UseWebRTCOptions {
  isHost: boolean;
  onIceCandidate: (candidate: string, sdpMid: string | null, sdpMLineIndex: number | null) => void;
  onOffer?: (sdp: string) => void;
  onAnswer?: (sdp: string) => void;
  onRemoteStream?: (stream: MediaStream) => void;
  onDataChannel?: (channel: RTCDataChannel) => void;
}

export function useWebRTC(options: UseWebRTCOptions) {
  const { isHost: _isHost, onIceCandidate, onOffer, onAnswer, onRemoteStream, onDataChannel } = options;

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  const [state, setState] = useState<WebRTCState>({
    connectionState: 'new',
    iceConnectionState: 'new',
    isConnected: false,
    hasRemoteStream: false,
    error: null,
  });

  // Create peer connection
  const createPeerConnection = useCallback(() => {
    if (peerConnectionRef.current) {
      return peerConnectionRef.current;
    }

    console.log('Creating peer connection...');
    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('ICE candidate:', event.candidate.candidate);
        onIceCandidate(
          event.candidate.candidate,
          event.candidate.sdpMid,
          event.candidate.sdpMLineIndex
        );
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log('Connection state:', pc.connectionState);
      setState((prev) => ({
        ...prev,
        connectionState: pc.connectionState,
        isConnected: pc.connectionState === 'connected',
      }));
    };

    // Handle ICE connection state changes
    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState);
      setState((prev) => ({
        ...prev,
        iceConnectionState: pc.iceConnectionState,
      }));
    };

    // Handle incoming tracks (viewer side)
    pc.ontrack = (event) => {
      console.log('Received remote track:', event.track.kind);
      if (event.streams && event.streams[0]) {
        setState((prev) => ({ ...prev, hasRemoteStream: true }));
        onRemoteStream?.(event.streams[0]);
      }
    };

    // Handle data channel (viewer side - receiving)
    pc.ondatachannel = (event) => {
      console.log('Received data channel:', event.channel.label);
      dataChannelRef.current = event.channel;
      setupDataChannel(event.channel);
      onDataChannel?.(event.channel);
    };

    peerConnectionRef.current = pc;
    return pc;
  }, [onIceCandidate, onRemoteStream, onDataChannel]);

  // Setup data channel event handlers
  const setupDataChannel = useCallback((channel: RTCDataChannel) => {
    channel.onopen = () => {
      console.log('Data channel opened');
    };
    channel.onclose = () => {
      console.log('Data channel closed');
    };
    channel.onerror = (error) => {
      console.error('Data channel error:', error);
    };
  }, []);

  // Start screen capture (host only)
  const startScreenCapture = useCallback(async (): Promise<MediaStream | null> => {
    try {
      console.log('Starting screen capture...');
      const displayMediaOptions: DisplayMediaStreamOptions = {
        video: true,
        audio: false,
      };
      const stream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);

      localStreamRef.current = stream;

      // Handle stream end (user clicked "Stop sharing")
      stream.getVideoTracks()[0].onended = () => {
        console.log('Screen sharing ended by user');
        stopScreenCapture();
      };

      return stream;
    } catch (err) {
      console.error('Failed to capture screen:', err);
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to capture screen',
      }));
      return null;
    }
  }, []);

  // Stop screen capture
  const stopScreenCapture = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
  }, []);

  // Create and send offer (host)
  const createOffer = useCallback(async () => {
    const pc = createPeerConnection();

    // Start screen capture
    const stream = await startScreenCapture();
    if (!stream) {
      throw new Error('Failed to capture screen');
    }

    // Add tracks to peer connection
    stream.getTracks().forEach((track) => {
      console.log('Adding track:', track.kind);
      pc.addTrack(track, stream);
    });

    // Create data channel for input events
    const dataChannel = pc.createDataChannel('input', {
      ordered: true,
    });
    dataChannelRef.current = dataChannel;
    setupDataChannel(dataChannel);
    onDataChannel?.(dataChannel);

    // Create offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    console.log('Created offer');
    onOffer?.(offer.sdp || '');

    return offer.sdp;
  }, [createPeerConnection, startScreenCapture, setupDataChannel, onOffer, onDataChannel]);

  // Handle received offer (viewer)
  const handleOffer = useCallback(async (sdp: string) => {
    console.log('Handling offer...');
    const pc = createPeerConnection();

    await pc.setRemoteDescription({
      type: 'offer',
      sdp,
    });

    // Add any pending ICE candidates
    for (const candidate of pendingCandidatesRef.current) {
      await pc.addIceCandidate(candidate);
    }
    pendingCandidatesRef.current = [];

    // Create answer
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    console.log('Created answer');
    onAnswer?.(answer.sdp || '');

    return answer.sdp;
  }, [createPeerConnection, onAnswer]);

  // Handle received answer (host)
  const handleAnswer = useCallback(async (sdp: string) => {
    console.log('Handling answer...');
    const pc = peerConnectionRef.current;
    if (!pc) {
      console.error('No peer connection');
      return;
    }

    await pc.setRemoteDescription({
      type: 'answer',
      sdp,
    });

    // Add any pending ICE candidates
    for (const candidate of pendingCandidatesRef.current) {
      await pc.addIceCandidate(candidate);
    }
    pendingCandidatesRef.current = [];
  }, []);

  // Handle received ICE candidate
  const handleIceCandidate = useCallback(async (
    candidate: string,
    sdpMid: string | null,
    sdpMLineIndex: number | null
  ) => {
    const pc = peerConnectionRef.current;
    const iceCandidate: RTCIceCandidateInit = {
      candidate,
      sdpMid,
      sdpMLineIndex,
    };

    if (!pc || !pc.remoteDescription) {
      // Queue candidate for later
      console.log('Queuing ICE candidate');
      pendingCandidatesRef.current.push(iceCandidate);
      return;
    }

    console.log('Adding ICE candidate');
    await pc.addIceCandidate(iceCandidate);
  }, []);

  // Send data via data channel
  const sendData = useCallback((data: string | ArrayBuffer) => {
    const channel = dataChannelRef.current;
    if (channel && channel.readyState === 'open') {
      channel.send(data as string);
    }
  }, []);

  // Close connection
  const close = useCallback(() => {
    console.log('Closing WebRTC connection');

    stopScreenCapture();

    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    pendingCandidatesRef.current = [];

    setState({
      connectionState: 'new',
      iceConnectionState: 'new',
      isConnected: false,
      hasRemoteStream: false,
      error: null,
    });
  }, [stopScreenCapture]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      close();
    };
  }, [close]);

  return {
    state,
    localStream: localStreamRef.current,
    dataChannel: dataChannelRef.current,
    createOffer,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    sendData,
    close,
  };
}
