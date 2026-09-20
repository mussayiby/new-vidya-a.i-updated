import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type LiveRole = "teacher" | "student";

type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

type SignalPayload = {
  from?: string;
  to?: string;
  peerId?: string;
  role?: LiveRole;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

type Options = {
  classId: string;
  role: LiveRole;
  active?: boolean;
};

const rtcConfiguration: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }],
};

function sendSignal(
  channel: ReturnType<typeof supabase.channel>,
  event: string,
  payload: SignalPayload,
) {
  void channel.httpSend({
    type: "broadcast",
    event,
    payload,
  });
}

export function useLiveWebRTC({ classId, role, active = true }: Options) {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  const [mediaError, setMediaError] = useState<string | null>(null);

  const [classEnded, setClassEnded] = useState(false);

  const [cameraEnabled, setCameraEnabled] = useState(false);

  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);

  const [audioEnabled, setAudioEnabled] = useState(true);

  const [screenShareEnabled, setScreenShareEnabled] = useState(false);

  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);

  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);

  const peerConnectionsRef = useRef(new Map<string, RTCPeerConnection>());

  const pendingCandidatesRef = useRef(new Map<string, RTCIceCandidateInit[]>());

  const peerIdRef = useRef(crypto.randomUUID());

  const mountedRef = useRef(false);

  const joinTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /*
   * ---------------------------------------------------------
   * CLOSE PEER
   * ---------------------------------------------------------
   */

  const closePeer = useCallback((peerId: string) => {
    const connection = peerConnectionsRef.current.get(peerId);

    connection?.close();

    peerConnectionsRef.current.delete(peerId);

    pendingCandidatesRef.current.delete(peerId);
  }, []);

  /*
   * ---------------------------------------------------------
   * ADD PENDING ICE CANDIDATES
   * ---------------------------------------------------------
   */

  const addPendingCandidates = useCallback(
    async (peerId: string, connection: RTCPeerConnection) => {
      const candidates = pendingCandidatesRef.current.get(peerId) ?? [];

      pendingCandidatesRef.current.delete(peerId);

      for (const candidate of candidates) {
        try {
          await connection.addIceCandidate(candidate);
        } catch {
          // Ignore stale ICE candidates.
        }
      }
    },
    [],
  );

  /*
   * ---------------------------------------------------------
   * ADD LOCAL CAMERA + MICROPHONE
   * ---------------------------------------------------------
   */

  const addLocalTracks = useCallback((connection: RTCPeerConnection) => {
    const stream = localStreamRef.current;

    if (!stream) return;

    const existingKinds = new Set(
      connection
        .getSenders()
        .map((sender) => sender.track?.kind)
        .filter(Boolean),
    );

    for (const track of stream.getTracks()) {
      if (!existingKinds.has(track.kind)) {
        connection.addTrack(track, stream);
      }
    }
  }, []);

  /*
   * ---------------------------------------------------------
   * CREATE PEER
   * ---------------------------------------------------------
   */

  const createPeer = useCallback(
    (peerId: string) => {
      const existing = peerConnectionsRef.current.get(peerId);

      if (existing) return existing;

      const connection = new RTCPeerConnection(rtcConfiguration);

      peerConnectionsRef.current.set(peerId, connection);

      addLocalTracks(connection);

      connection.onicecandidate = (event) => {
        if (!event.candidate) return;

        const channel = channelRef.current;

        if (!channel) return;

        sendSignal(channel, "ice-candidate", {
          from: peerIdRef.current,
          to: peerId,
          candidate: event.candidate.toJSON(),
        });
      };

      connection.onconnectionstatechange = () => {
        const state = connection.connectionState;

        if (state === "connected") {
          setStatus("connected");
        }

        if (state === "disconnected" || state === "failed") {
          setStatus("reconnecting");
        }

        if (state === "closed") {
          setStatus("disconnected");
        }
      };

      connection.ontrack = (event) => {
        const stream = event.streams[0];

        if (!stream) return;

        setRemoteStream(stream);

        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;

          remoteVideoRef.current.muted = false;

          remoteVideoRef.current.volume = 1;

          void remoteVideoRef.current.play().catch(() => {
            setAudioEnabled(false);
          });
        }
      };

      return connection;
    },
    [addLocalTracks],
  );

  /*
   * ---------------------------------------------------------
   * TEACHER CREATES OFFER
   * ---------------------------------------------------------
   */

  const createTeacherOffer = useCallback(
    async (studentId: string) => {
      const channel = channelRef.current;

      if (!channel) return;

      const connection = createPeer(studentId);

      const offer = await connection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });

      await connection.setLocalDescription(offer);

      sendSignal(channel, "offer", {
        from: peerIdRef.current,
        to: studentId,
        description: offer,
      });
    },
    [createPeer],
  );

  /*
   * ---------------------------------------------------------
   * GET CAMERA + MICROPHONE
   * ---------------------------------------------------------
   */

  const startLocalMedia = useCallback(async () => {
    if (localStreamRef.current) return;

    setMediaError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: {
            ideal: 1280,
          },
          height: {
            ideal: 720,
          },
          frameRate: {
            ideal: 30,
            max: 30,
          },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      localStreamRef.current = stream;

      setCameraEnabled(true);
      setMicrophoneEnabled(true);

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;

        await localVideoRef.current.play().catch(() => {});
      }

      /*
       * Add tracks to existing connections.
       */

      for (const connection of peerConnectionsRef.current.values()) {
        addLocalTracks(connection);
      }

      /*
       * Student announces itself after
       * acquiring media.
       */

      const channel = channelRef.current;

      if (channel && role === "student") {
        sendSignal(channel, "join", {
          peerId: peerIdRef.current,
          role,
        });
      }

      /*
       * Teacher renegotiates existing students.
       */

      if (role === "teacher") {
        for (const studentId of peerConnectionsRef.current.keys()) {
          await createTeacherOffer(studentId);
        }
      }
    } catch {
      setMediaError(
        "Camera or microphone permission was denied. Please allow access in your browser.",
      );
    }
  }, [addLocalTracks, createTeacherOffer, role]);

  /*
   * ---------------------------------------------------------
   * MICROPHONE
   * ---------------------------------------------------------
   */

  const toggleMicrophone = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];

    if (!track) return;

    track.enabled = !track.enabled;

    setMicrophoneEnabled(track.enabled);
  }, []);

  /*
   * ---------------------------------------------------------
   * CAMERA
   * ---------------------------------------------------------
   */

  const toggleCamera = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0];

    if (!track) return;

    track.enabled = !track.enabled;

    setCameraEnabled(track.enabled);
  }, []);

  /*
   * ---------------------------------------------------------
   * ENABLE STUDENT AUDIO
   * ---------------------------------------------------------
   */

  const enableAudio = useCallback(() => {
    const video = remoteVideoRef.current;

    if (!video) return;

    video.muted = false;
    video.volume = 1;

    void video
      .play()
      .then(() => {
        setAudioEnabled(true);
      })
      .catch(() => {
        setAudioEnabled(false);
      });
  }, []);

  const setRemoteAudioMuted = useCallback((muted: boolean) => {
    const video = remoteVideoRef.current;
    if (!video) return;
    video.muted = muted;
    if (!muted) void video.play().catch(() => setAudioEnabled(false));
  }, []);

  const shareScreen = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      setMediaError("Screen sharing is not supported in this browser.");
      return;
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      const videoTrack = displayStream.getVideoTracks()[0];
      if (!videoTrack) return;

      const currentStream = localStreamRef.current;
      if (currentStream) {
        const existingVideoTracks = currentStream.getVideoTracks();
        for (const existingTrack of existingVideoTracks) {
          currentStream.removeTrack(existingTrack);
        }
        currentStream.addTrack(videoTrack);
      }

      setScreenShareEnabled(true);
      setCameraEnabled(true);

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = currentStream ?? displayStream;
        void localVideoRef.current.play().catch(() => {});
      }

      videoTrack.onended = () => {
        setScreenShareEnabled(false);
        if (currentStream) {
          const activeTrack = currentStream.getVideoTracks()[0];
          if (activeTrack) {
            currentStream.removeTrack(activeTrack);
          }
        }
      };
    } catch {
      setMediaError("Screen sharing was cancelled or blocked by the browser.");
    }
  }, []);

  /*
   * ---------------------------------------------------------
   * END CLASS
   * ---------------------------------------------------------
   */

  const endClass = useCallback(() => {
    const channel = channelRef.current;

    if (!channel) return;

    if (role === "teacher") {
      sendSignal(channel, "class-ended", {
        from: peerIdRef.current,
      });
    }
  }, [role]);

  /*
   * ---------------------------------------------------------
   * SIGNALING
   * ---------------------------------------------------------
   */

  useEffect(() => {
    if (!active) return;

    mountedRef.current = true;

    const channel = supabase.channel(`live-media-${classId}`);

    channelRef.current = channel;

    const handleSignal = async ({ event, payload }: { event: string; payload: SignalPayload }) => {
      if (!mountedRef.current) return;

      if (payload.to && payload.to !== peerIdRef.current) {
        return;
      }

      /*
       * STUDENT JOINED
       */

      if (event === "join" && role === "teacher" && payload.role === "student" && payload.peerId) {
        await createTeacherOffer(payload.peerId);

        return;
      }

      /*
       * STUDENT RECEIVES OFFER
       */

      if (event === "offer" && role === "student" && payload.from && payload.description) {
        const connection = createPeer(payload.from);

        await connection.setRemoteDescription(payload.description);

        await addPendingCandidates(payload.from, connection);

        const answer = await connection.createAnswer();

        await connection.setLocalDescription(answer);

        sendSignal(channel, "answer", {
          from: peerIdRef.current,
          to: payload.from,
          description: answer,
        });

        return;
      }

      /*
       * TEACHER RECEIVES ANSWER
       */

      if (event === "answer" && role === "teacher" && payload.from && payload.description) {
        const connection = peerConnectionsRef.current.get(payload.from);

        if (!connection) return;

        await connection.setRemoteDescription(payload.description);

        return;
      }

      /*
       * ICE
       */

      if (event === "ice-candidate" && payload.from && payload.candidate) {
        const connection = peerConnectionsRef.current.get(payload.from);

        if (!connection || !connection.remoteDescription) {
          const pending = pendingCandidatesRef.current.get(payload.from) ?? [];

          pending.push(payload.candidate);

          pendingCandidatesRef.current.set(payload.from, pending);
        } else {
          try {
            await connection.addIceCandidate(payload.candidate);
          } catch {
            // Ignore stale candidate.
          }
        }

        return;
      }

      /*
       * PEER LEFT
       */

      if (event === "leave" && payload.peerId) {
        closePeer(payload.peerId);
      }

      /*
       * CLASS ENDED
       */

      if (event === "class-ended" && role === "student") {
        setClassEnded(true);
      }
    };

    /*
     * Register signaling events.
     */

    const events = ["join", "offer", "answer", "ice-candidate", "leave", "class-ended"];

    for (const event of events) {
      channel.on("broadcast", { event }, handleSignal);
    }

    channel.subscribe((subscriptionStatus) => {
      if (subscriptionStatus === "SUBSCRIBED") {
        setStatus("connected");

        /*
         * Student announces itself.
         */

        if (role === "student") {
          sendSignal(channel, "join", {
            peerId: peerIdRef.current,
            role,
          });
        }
      }

      if (subscriptionStatus === "CHANNEL_ERROR" || subscriptionStatus === "TIMED_OUT") {
        setStatus("reconnecting");
      }
    });

    /*
     * Student retries join because
     * teacher may not have subscribed yet.
     */

    if (role === "student") {
      joinTimerRef.current = setInterval(() => {
        if (peerConnectionsRef.current.size === 0) {
          sendSignal(channel, "join", {
            peerId: peerIdRef.current,
            role,
          });
        }
      }, 2000);
    }

    return () => {
      mountedRef.current = false;

      if (joinTimerRef.current) {
        clearInterval(joinTimerRef.current);
      }

      if (role === "student") {
        sendSignal(channel, "leave", {
          peerId: peerIdRef.current,
        });
      }

      if (role === "teacher") {
        sendSignal(channel, "class-ended", {
          from: peerIdRef.current,
        });
      }

      for (const peerId of peerConnectionsRef.current.keys()) {
        closePeer(peerId);
      }

      localStreamRef.current?.getTracks().forEach((track) => track.stop());

      localStreamRef.current = null;
      setRemoteStream(null);

      channelRef.current = null;

      void supabase.removeChannel(channel);
    };
  }, [active, addPendingCandidates, classId, closePeer, createPeer, createTeacherOffer, role]);

  return {
    status,
    mediaError,
    classEnded,

    cameraEnabled,
    microphoneEnabled,
    audioEnabled,
    screenShareEnabled,
    remoteStream,

    localVideoRef,
    remoteVideoRef,

    startLocalMedia,
    toggleMicrophone,
    toggleCamera,
    enableAudio,
    setRemoteAudioMuted,
    shareScreen,
    endClass,
  };
}
