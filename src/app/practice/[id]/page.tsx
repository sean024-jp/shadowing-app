"use client";

import { useEffect, useState, useRef, use } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { Material, TranscriptItem } from "@/types/models";
import { PlaybackControls } from "@/components/PlaybackControls";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export default function PracticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const [material, setMaterial] = useState<Material | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playerUnlocked, setPlayerUnlocked] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isLooping, setIsLooping] = useState(false);
  const [showScript, setShowScript] = useState(true);
  const [showJapanese, setShowJapanese] = useState(false); // Default OFF for mobile opt
  const [showMobileVideo, setShowMobileVideo] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);

  // Mode & Recording State
  const [practiceMode, setPracticeMode] = useState<"practice" | "recording">("practice");
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "review">("idle");

  // Audio Recorder Hook
  const recorder = useAudioRecorder(user?.id, material?.id, null);

  // A-B Loop State (independent A/B points)
  const [loopA, setLoopA] = useState<number | null>(null);
  const [loopB, setLoopB] = useState<number | null>(null);

  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load material, recording, and favorite status
  useEffect(() => {
    if (user) {
      loadMaterial();
      loadRecording();
      loadFavoriteStatus();
    }
  }, [user, id]);

  const loadMaterial = async () => {
    const { data, error } = await supabase
      .from("materials")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error("Error loading material:", error);
    } else {
      setMaterial(data);
    }
    setLoading(false);
  };

  // Record practice history
  useEffect(() => {
    if (user && id) {
      const recordHistory = async () => {
        const { error } = await supabase
          .from("practice_history")
          .insert({
            user_id: user.id,
            material_id: id,
            practiced_at: new Date().toISOString(),
          });

        if (error) {
          console.error("Failed to record history (practice_history):", error);
        } else {
          console.log("History recorded successfully");
        }
      };
      recordHistory();
    }
  }, [user, id]);

  const loadRecording = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("practice_recordings")
      .select("audio_path")
      .eq("user_id", user.id)
      .eq("material_id", id)
      .single();

    if (data) {
      recorder.setAudioPath(data.audio_path);
    }
  };

  const loadFavoriteStatus = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("user_favorites")
      .select("id")
      .eq("user_id", user.id)
      .eq("material_id", id)
      .maybeSingle();
    setIsFavorite(!!data);
  };

  const toggleFavorite = async () => {
    if (!user) return;
    setIsFavorite((prev) => !prev);
    if (isFavorite) {
      await supabase
        .from("user_favorites")
        .delete()
        .eq("user_id", user.id)
        .eq("material_id", id);
    } else {
      await supabase
        .from("user_favorites")
        .insert({ user_id: user.id, material_id: id });
    }
  };

  // Mode switch: pause, seek to start, reset state
  const handleModeToggle = () => {
    if (playerRef.current) {
      playerRef.current.pauseVideo();
      // Delay seek to avoid buffering deadlock when pausing and seeking simultaneously
      setTimeout(() => {
        playerRef.current?.seekTo(material?.start_time || 0, true);
      }, 200);
    }
    setIsPlaying(false);
    setRecordingState("idle");
    setPracticeMode(practiceMode === "practice" ? "recording" : "practice");
  };

  const handleStartRecording = async () => {
    if (!material || !playerRef.current) return;

    // Preparation
    setRecordingState("recording");
    playerRef.current.seekTo(material.start_time, true);
    playerRef.current.playVideo();
    await recorder.startRecording();
  };

  const handleStopRecording = async (shouldSave: boolean) => {
    // If we're already reviewing or idle, don't re-trigger stopping logic
    if (recordingState !== "recording") return;

    if (playerRef.current) playerRef.current.pauseVideo();

    if (shouldSave) {
      setRecordingState("review");
      await recorder.stopRecording();
    } else {
      setRecordingState("idle");
      await recorder.stopRecording(); // Stop hardware
      recorder.discardRecording(); // Don't show preview
    }
  };

  // Ref to hold the latest state and handlers for YouTube callbacks
  // This prevents closure staleness without re-initializing the player
  const handlersRef = useRef({
    practiceMode,
    recordingState,
    material,
    handleStopRecording,
    setIsPlaying,
    isLooping,
    loopA,
    loopB
  });

  useEffect(() => {
    handlersRef.current = {
      practiceMode,
      recordingState,
      material,
      handleStopRecording,
      setIsPlaying,
      isLooping,
      loopA,
      loopB
    };
  }, [practiceMode, recordingState, material, handleStopRecording, isLooping, loopA, loopB]);

  // Sync playback rate
  useEffect(() => {
    if (playerRef.current && playerRef.current.setPlaybackRate) {
      playerRef.current.setPlaybackRate(playbackRate);
    }
  }, [playbackRate]);

  // Timer loop for detailed time tracking & Looping logic & Auto-stop recording
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying && playerRef.current && playerRef.current.getCurrentTime) {
      interval = setInterval(() => {
        const time = playerRef.current.getCurrentTime() || 0;
        setCurrentTime(time);

        // Handle Auto-stop recording
        if (practiceMode === "recording" && recordingState === "recording" && material) {
          if (time >= material.end_time) {
            handleStopRecording(true);
          }
        }

        // Handle Looping
        if (isLooping && material && practiceMode === "practice") {
          const start = loopA ?? material.start_time;
          const end = loopB ?? material.end_time;

          if (start < end && time >= end) {
            playerRef.current.seekTo(start, true);
          }
        }
      }, 50); // Faster check for better precision
    }
    return () => clearInterval(interval);
  }, [isPlaying, isLooping, material, loopA, loopB, practiceMode, recordingState, handleStopRecording]);

  const onPlayerReady = (event: any) => {
    event.target.setPlaybackRate(playbackRate);
  };

  const onPlayerStateChange = (event: any) => {
    const {
      practiceMode,
      recordingState,
      material,
      handleStopRecording,
      setIsPlaying
    } = handlersRef.current;

    const playing = event.data === window.YT.PlayerState.PLAYING;
    const paused = event.data === window.YT.PlayerState.PAUSED;
    const ended = event.data === window.YT.PlayerState.ENDED;

    setIsPlaying(playing);

    // Unlock player after first successful play (needed for mobile autoplay policy)
    if (playing) {
      setPlayerUnlocked(true);
    }

    // If recording, handle auto-stop or interruption
    if (practiceMode === "recording" && recordingState === "recording") {
      if (ended) {
        handleStopRecording(true);
      } else if (paused) {
        // YouTube often pauses slightly before the actual end_time
        const time = event.target.getCurrentTime() || 0;
        if (material && time >= material.end_time - 0.2) {
          handleStopRecording(true);
        } else {
          // Actual manual pause detected during recording -> discard
          handleStopRecording(false);
        }
      }
    }
  };

  // Initialize YouTube Player
  useEffect(() => {
    if (!material) return;

    // Load API if not already present
    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }

    const initPlayer = () => {
      if (!document.getElementById("youtube-player")) return;
      if (playerRef.current) return; // Prevent double init

      playerRef.current = new window.YT.Player("youtube-player", {
        videoId: material.youtube_id,
        playerVars: {
          start: Math.floor(material.start_time),
          end: Math.ceil(material.end_time),
          controls: 0,
          disablekb: 1,
          playsinline: 1,
          modestbranding: 1,
          rel: 0,
          iv_load_policy: 3,
        },
        events: {
          onStateChange: (e: any) => onPlayerStateChange(e),
          onReady: (e: any) => onPlayerReady(e),
        },
      });
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      window.onYouTubeIframeAPIReady = initPlayer;
    }

    return () => {
      // We don't necessarily want to destroy on every material change if it's the same video,
      // but the app structure currently expects material-specific players.
      if (playerRef.current && playerRef.current.destroy) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [material?.youtube_id]); // Only re-init if video ID changes

  const getCurrentIndex = (transcript: TranscriptItem[]) => {
    if (!transcript) return -1;
    const timeMs = currentTime * 1000;
    for (let i = transcript.length - 1; i >= 0; i--) {
      if (transcript[i].offset <= timeMs) {
        return i;
      }
    }
    return -1;
  };

  const scrollToCurrentWord = (index: number) => {
    const element = document.getElementById(`line-${index}`);
    if (element && containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const relativeTop = elementRect.top - containerRect.top;

      // Scroll if not in the centered sweet spot (30%-70%)
      if (relativeTop < containerRect.height * 0.3 || relativeTop > containerRect.height * 0.7) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  };

  const currentIndex = material ? getCurrentIndex(material.transcript) : -1;

  // Auto-scroll
  useEffect(() => {
    if (currentIndex >= 0) {
      scrollToCurrentWord(currentIndex);
    }
  }, [currentIndex]);

  const seekTo = (timeMs: number) => {
    if (playerRef.current) {
      playerRef.current.seekTo(timeMs / 1000, true);
      playerRef.current.playVideo();
    }
  };

  const handleTogglePlay = () => {
    if (playerRef.current) {
      if (isPlaying) playerRef.current.pauseVideo();
      else playerRef.current.playVideo();
    }
  };

  const handleRestart = () => {
    if (playerRef.current) {
      playerRef.current.seekTo(material?.start_time || 0, true);
      playerRef.current.playVideo();
    }
  };

  // Loop Control Handlers (independent A/B toggle)
  const handleToggleLoopA = () => {
    if (loopA !== null) {
      setLoopA(null);
      if (loopB === null) setIsLooping(false);
    } else {
      const time = playerRef.current ? playerRef.current.getCurrentTime() : (material?.start_time ?? 0);
      setLoopA(time);
      setIsLooping(true);
    }
  };

  const handleToggleLoopB = () => {
    if (loopB !== null) {
      setLoopB(null);
      if (loopA === null) setIsLooping(false);
    } else {
      const time = playerRef.current ? playerRef.current.getCurrentTime() : (material?.end_time ?? 60);
      setLoopB(time);
      setIsLooping(true);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-gray-900">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!material) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-white dark:bg-gray-900">
        <p className="text-gray-500">教材が見つかりません</p>
        <Link href="/" className="text-blue-600 hover:underline">
          ホームに戻る
        </Link>
      </div>
    );
  }

  const renderScriptLine = (item: TranscriptItem, idx: number) => {
    const isActive = idx === currentIndex;

    // Find match
    const transcriptEn = material.transcript;
    const transcriptJa = material.transcript_ja;
    let jaItem = null;

    if (transcriptJa && transcriptJa.length > 0) {
      // 1. Try index match if lengths overlap significantly (heuristic)
      // If exact length match, assume index alignment
      if (transcriptJa.length === transcriptEn.length) {
        jaItem = transcriptJa[idx];
      } else {
        // 2. Time-based matching with wider window
        const myStart = item.offset;
        let bestMatch = null;
        let minDiff = Infinity;

        // Search window optimization could be done here, but N is small
        for (const ja of transcriptJa) {
          const diff = Math.abs(ja.offset - myStart);
          if (diff < minDiff) {
            minDiff = diff;
            bestMatch = ja;
          }
        }
        // Allow up to 3 seconds diff, effectively finding the "closest" line
        if (minDiff < 3000) {
          jaItem = bestMatch;
        }
      }
    }

    return (
      <div
        key={idx}
        id={`line-${idx}`}
        onClick={() => seekTo(item.offset)}
        className={`p-2 rounded-lg cursor-pointer transition-colors duration-200 mb-1 ${isActive
          ? "bg-blue-50 dark:bg-blue-900/30 border-l-4 border-blue-500"
          : "hover:bg-gray-50 dark:hover:bg-gray-800 border-l-4 border-transparent"
          }`}
      >
        {showScript && (
          <p className={`text-base leading-snug ${isActive ? "font-bold text-gray-900 dark:text-gray-100" : "text-gray-700 dark:text-gray-300"}`}>
            {item.text}
          </p>
        )}
        {showJapanese && jaItem && (
          <p className={`text-xs mt-0.5 leading-snug ${isActive ? "text-gray-700 dark:text-gray-300 font-medium" : "text-gray-500 dark:text-gray-500"}`}>
            {jaItem.text}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-white dark:bg-gray-900">
      {/* Header - Compact */}
      <div className="shrink-0 flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 z-10">
        <Link href="/" className="text-blue-600 hover:underline flex items-center gap-1 text-sm shrink-0">
          ← 戻る
        </Link>
        <h1 className="text-sm font-bold text-gray-800 dark:text-gray-200 line-clamp-1 flex-1 text-center px-2">
          {material.title}
        </h1>
        {/* Favorite star */}
        <button
          onClick={toggleFavorite}
          className="shrink-0 w-8 h-8 flex items-center justify-center"
          title={isFavorite ? "お気に入り解除" : "お気に入り追加"}
        >
          <svg className="w-5 h-5" fill={isFavorite ? "#eab308" : "none"} stroke="#eab308" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        </button>
        {/* Mobile video toggle */}
        <button
          onClick={() => setShowMobileVideo(!showMobileVideo)}
          className={`md:hidden w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${showMobileVideo ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/30' : 'text-gray-400 hover:text-gray-600'}`}
          title={showMobileVideo ? '動画を非表示' : '動画を表示'}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {showMobileVideo ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2zM3 3l18 18" />
            )}
          </svg>
        </button>
        <div className="hidden md:block w-8" /> {/* Desktop spacer */}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0">

        {/* Video Column - toggleable on mobile, always visible on desktop */}
        <div className={`shrink-0 md:w-1/2 lg:w-7/12 bg-gray-50 dark:bg-gray-800 flex flex-col md:p-4 ${!showMobileVideo ? 'mobile-video-hidden' : ''}`}>
          <div className="aspect-video bg-black rounded-lg overflow-hidden shadow-lg relative md:mb-4">
            <div id="youtube-player" className="w-full h-full" />
            {/* Block direct interaction after first play (mobile needs initial tap on iframe) */}
            {playerUnlocked && <div className="absolute inset-0 z-10" />}
          </div>
        </div>
        <style jsx>{`
          @media (max-width: 767px) {
            .mobile-video-hidden {
              height: 0;
              overflow: hidden;
            }
          }
        `}</style>

        {/* Script Area */}
        <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-gray-900 relative">
          <div ref={containerRef} className="absolute inset-0 overflow-y-auto p-3" style={{ paddingBottom: "160px" }}> {/* Extra padding for bottom controls */}
            {material.transcript.map((item, idx) => renderScriptLine(item, idx))}
          </div>
        </div>
      </div>

      {/* Bottom Controls Area - Fixed/Sticky at bottom */}
      <div className="shrink-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 p-2 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-20">
        <div className="max-w-4xl mx-auto">
          <PlaybackControls
            practiceMode={practiceMode}
            onModeToggle={handleModeToggle}
            recordingState={recordingState}
            playerUnlocked={playerUnlocked}
            isPlaying={isPlaying}
            onTogglePlay={handleTogglePlay}
            onRestart={handleRestart}
            playBackRate={playbackRate}
            onSpeedChange={setPlaybackRate}
            loop={isLooping}
            onLoopToggle={() => setIsLooping(!isLooping)}
            loopA={loopA}
            loopB={loopB}
            onToggleLoopA={handleToggleLoopA}
            onToggleLoopB={handleToggleLoopB}
            showScript={showScript}
            onScriptToggle={() => setShowScript(!showScript)}
            showJapanese={showJapanese}
            onJapaneseToggle={() => setShowJapanese(!showJapanese)}
            hasJapanese={!!material.transcript_ja}
            onStartRecording={handleStartRecording}
            onStopRecording={handleStopRecording}
            recorder={recorder}
          />
        </div>
      </div>
    </div>
  );
}
