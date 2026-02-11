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
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isLooping, setIsLooping] = useState(false);
  const [showScript, setShowScript] = useState(true);
  const [showJapanese, setShowJapanese] = useState(false); // Default OFF for mobile opt
  const [showMobileVideo, setShowMobileVideo] = useState(false);

  // Audio Recorder Hook
  const recorder = useAudioRecorder(user?.id, material?.id, null);

  // A-B Loop State
  const [loopRange, setLoopRange] = useState<{ start: number; end: number } | null>(null);

  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load material and recording
  useEffect(() => {
    if (user) {
      loadMaterial();
      loadRecording();
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
        // Upsert or Insert history
        // If we want to keep ONLY the latest practice per material: upsert based on (user_id, material_id)
        // If we want a log: insert.
        // MyPage shows unique materials, so probably "Latest".
        // Let's assume unique constraint on (user_id, material_id) or similar, or just insert and MyPage handles duplicates?
        // MyPage: .select("*, materials(*)")...
        // If duplicates exist, MyPage shows all.
        // Let's check MyPage again. It maps history items to cards.
        // Let's try to upsert to prevent spamming history if user refreshes.
        // However, standard SQL upsert needs constraint.
        // Let's simply delete old one and insert new to be safe? Or just insert.
        // User asked: "閲覧履歴に過去練習したものが登録されていない" -> Likely nothing was being inserted.
        // Let's insert.
        const { error } = await supabase
          .from("practice_history")
          .insert({
            user_id: user.id,
            material_id: id,
            practiced_at: new Date().toISOString(),
          });

        if (error) console.error("Failed to record history", error);
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

  // Initialize YouTube Player
  useEffect(() => {
    if (!material) return;

    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName("script")[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

    window.onYouTubeIframeAPIReady = () => {
      // Ensure element exists before creating player
      if (!document.getElementById("youtube-player")) return;

      playerRef.current = new window.YT.Player("youtube-player", {
        videoId: material.youtube_id,
        playerVars: {
          start: material.start_time,
          end: material.end_time,
          controls: 1,
          modestbranding: 1,
          rel: 0,
        },
        events: {
          onStateChange: onPlayerStateChange,
          onReady: onPlayerReady,
        },
      });
    };

    if (window.YT && window.YT.Player) {
      window.onYouTubeIframeAPIReady();
    }

    return () => {
      if (playerRef.current && playerRef.current.destroy) {
        playerRef.current.destroy();
      }
    };
  }, [material]);

  // Sync playback rate
  useEffect(() => {
    if (playerRef.current && playerRef.current.setPlaybackRate) {
      playerRef.current.setPlaybackRate(playbackRate);
    }
  }, [playbackRate]);

  // Timer loop for detailed time tracking & Looping logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying && playerRef.current && playerRef.current.getCurrentTime) {
      interval = setInterval(() => {
        const time = playerRef.current.getCurrentTime() || 0;
        setCurrentTime(time);

        // Handle Looping
        if (isLooping && material) {
          const start = loopRange ? loopRange.start : material.start_time;
          const end = loopRange ? loopRange.end : material.end_time;

          if (time >= end) {
            playerRef.current.seekTo(start, true);
          }
        }
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isPlaying, isLooping, material, loopRange]);

  const onPlayerReady = (event: any) => {
    event.target.setPlaybackRate(playbackRate);
  };

  const onPlayerStateChange = (event: any) => {
    setIsPlaying(event.data === window.YT.PlayerState.PLAYING);
  };

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

  // Loop Control Handlers
  const handleSetLoopStart = () => {
    if (!material) return;
    const start = playerRef.current ? playerRef.current.getCurrentTime() : material.start_time;
    const end = loopRange ? loopRange.end : material.end_time;
    setLoopRange({ start, end: Math.max(start + 1, end) }); // Ensure end > start
    setIsLooping(true);
  };

  const handleSetLoopEnd = () => {
    if (!material) return;
    const end = playerRef.current ? playerRef.current.getCurrentTime() : material.end_time;
    const start = loopRange ? loopRange.start : material.start_time;
    setLoopRange({ start: Math.min(start, end - 1), end }); // Ensure start < end
    setIsLooping(true);
  };

  const handleClearLoop = () => {
    setLoopRange(null);
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
        <Link href="/" className="text-blue-600 hover:underline flex items-center gap-1 text-sm">
          ← 戻る
        </Link>
        <h1 className="text-sm font-bold text-gray-800 dark:text-gray-200 line-clamp-1 flex-1 text-center px-2">
          {material.title}
        </h1>
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
          </div>
        </div>
        <style jsx>{`
          @media (max-width: 767px) {
            .mobile-video-hidden {
              position: absolute;
              width: 1px;
              height: 1px;
              overflow: hidden;
              opacity: 0;
              pointer-events: none;
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
            isPlaying={isPlaying}
            onTogglePlay={handleTogglePlay}
            onRestart={handleRestart}
            playBackRate={playbackRate}
            onSpeedChange={setPlaybackRate}
            loop={isLooping}
            onLoopToggle={() => setIsLooping(!isLooping)}
            loopRange={loopRange}
            onSetLoopStart={handleSetLoopStart}
            onSetLoopEnd={handleSetLoopEnd}
            onClearLoop={handleClearLoop}
            showScript={showScript}
            onScriptToggle={() => setShowScript(!showScript)}
            showJapanese={showJapanese}
            onJapaneseToggle={() => setShowJapanese(!showJapanese)}
            hasJapanese={!!material.transcript_ja}
            recorder={recorder}
          />
        </div>
      </div>
    </div>
  );
}
