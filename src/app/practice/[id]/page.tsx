"use client";

import { useEffect, useState, useRef, use } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";

type TranscriptItem = {
  text: string;
  offset: number;
  duration: number;
};

type Material = {
  id: string;
  title: string;
  youtube_id: string;
  start_time: number;
  end_time: number;
  transcript: TranscriptItem[];
};

declare global {
  interface Window {
    YT: typeof YT;
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
  const playerRef = useRef<YT.Player | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) {
      loadMaterial();
    }
  }, [user, id]);

  useEffect(() => {
    if (!material) return;

    // Load YouTube IFrame API
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName("script")[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

    window.onYouTubeIframeAPIReady = () => {
      playerRef.current = new window.YT.Player("youtube-player", {
        videoId: material.youtube_id,
        playerVars: {
          start: material.start_time,
          end: material.end_time,
          controls: 1,
          modestbranding: 1,
        },
        events: {
          onStateChange: onPlayerStateChange,
        },
      });
    };

    // If API already loaded
    if (window.YT && window.YT.Player) {
      window.onYouTubeIframeAPIReady();
    }

    return () => {
      playerRef.current?.destroy();
    };
  }, [material]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying && playerRef.current) {
      interval = setInterval(() => {
        const time = playerRef.current?.getCurrentTime() || 0;
        setCurrentTime(time);
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  const loadMaterial = async () => {
    const { data } = await supabase
      .from("materials")
      .select("*")
      .eq("id", id)
      .single();
    setMaterial(data);
    setLoading(false);
  };

  const onPlayerStateChange = (event: YT.OnStateChangeEvent) => {
    setIsPlaying(event.data === window.YT.PlayerState.PLAYING);
  };

  const getCurrentIndex = () => {
    if (!material) return -1;
    const timeMs = currentTime * 1000;
    const startOffset = material.start_time * 1000;

    for (let i = material.transcript.length - 1; i >= 0; i--) {
      if (material.transcript[i].offset <= timeMs) {
        return i;
      }
    }
    return -1;
  };

  const scrollToCurrentWord = (index: number) => {
    const element = document.getElementById(`word-${index}`);
    if (element && containerRef.current) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  useEffect(() => {
    const index = getCurrentIndex();
    if (index >= 0) {
      scrollToCurrentWord(index);
    }
  }, [currentTime]);

  const restart = () => {
    if (playerRef.current && material) {
      playerRef.current.seekTo(material.start_time, true);
      playerRef.current.playVideo();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!material) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-gray-500">教材が見つかりません</p>
        <Link href="/" className="text-blue-600 hover:underline">
          ホームに戻る
        </Link>
      </div>
    );
  }

  const currentIndex = getCurrentIndex();

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Link href="/" className="text-blue-600 hover:underline mb-4 inline-block">
        ← 戻る
      </Link>

      <h1 className="text-2xl font-bold text-gray-800 mb-6">{material.title}</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="aspect-video bg-black rounded-lg overflow-hidden">
            <div id="youtube-player" className="w-full h-full" />
          </div>
          <button
            onClick={restart}
            className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition"
          >
            最初から再生
          </button>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="font-medium text-gray-700 mb-4">スクリプト</h2>
          <div
            ref={containerRef}
            className="h-80 overflow-y-auto space-y-1 text-lg leading-relaxed"
          >
            {material.transcript.map((item, idx) => {
              const isActive = idx === currentIndex;
              const isPast = idx < currentIndex;

              return (
                <span
                  key={idx}
                  id={`word-${idx}`}
                  className={`inline transition-all duration-200 ${
                    isActive
                      ? "bg-yellow-300 text-gray-900 font-medium px-1 rounded"
                      : isPast
                      ? "text-gray-400"
                      : "text-gray-700"
                  }`}
                >
                  {item.text}{" "}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
