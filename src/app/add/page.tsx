"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { extractVideoId, fetchYouTubeTitle } from "@/lib/youtube";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export default function RequestPage() {
  const { user } = useAuth();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(60);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [fetchingTitle, setFetchingTitle] = useState(false);

  const playerRef = useRef<any>(null);
  const videoId = url ? extractVideoId(url) : null;

  // Auto-fetch title
  useEffect(() => {
    if (videoId && !title) {
      setFetchingTitle(true);
      fetchYouTubeTitle(videoId).then((t) => {
        if (t) setTitle(t);
        setFetchingTitle(false);
      });
    }
  }, [videoId]);

  // Initialize YouTube Player
  useEffect(() => {
    if (!videoId) return;

    // Load API if not loaded
    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }

    const initPlayer = () => {
      // Create player if div exists
      if (document.getElementById("request-youtube-player")) {
        // Destroy existing if any
        if (playerRef.current && playerRef.current.destroy) {
          try { playerRef.current.destroy(); } catch (e) { }
        }

        playerRef.current = new window.YT.Player("request-youtube-player", {
          videoId: videoId,
          playerVars: {
            playsinline: 1,
            controls: 1,
            rel: 0,
          },
        });
      }
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      window.onYouTubeIframeAPIReady = () => {
        initPlayer();
      };
    }

    // Cleanup handled by destroy above or:
    return () => {
      // We ideally destroy on unmount or videoId change, but doing it in initPlayer covers videoId change.
      // On unmount:
      // if (playerRef.current?.destroy) playerRef.current.destroy();
    };

  }, [videoId]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const submitRequest = async () => {
    setError("");
    setSuccess(false);

    if (!videoId) {
      setError("無効なYouTube URLです");
      return;
    }

    const duration = endTime - startTime;
    if (duration < 30) {
      setError("選択範囲は最低30秒必要です");
      return;
    }
    if (duration > 180) {
      setError("選択範囲は最大3分（180秒）までです");
      return;
    }

    if (!user) return;
    setLoading(true);

    const { error: insertError } = await supabase
      .from("material_requests")
      .insert({
        user_id: user.id,
        youtube_url: url,
        youtube_id: videoId,
        title: title || null,
        start_time: startTime,
        end_time: endTime,
      });

    if (insertError) {
      setError("リクエストの送信に失敗しました: " + insertError.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setUrl("");
    setTitle("");
    setStartTime(0);
    setEndTime(60);
    setLoading(false);

    // Clear player logic if needed
  };

  const handleSetStart = () => {
    if (playerRef.current && playerRef.current.getCurrentTime) {
      const t = Math.floor(playerRef.current.getCurrentTime());
      setStartTime(t);
      // Ensure 30s min
      if (endTime - t < 30) setEndTime(Math.min(t + 30, 600));
      // Ensure 180s max
      if (endTime - t > 180) setEndTime(t + 180);
    }
  };

  const handleSetEnd = () => {
    if (playerRef.current && playerRef.current.getCurrentTime) {
      const t = Math.floor(playerRef.current.getCurrentTime());
      setEndTime(t);
      // Ensure 30s min
      if (t - startTime < 30) setStartTime(Math.max(t - 30, 0));
      // Ensure 180s max
      if (t - startTime > 180) setStartTime(t - 180);
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>ログインしてください</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 pb-20">
      <Link href="/" className="text-blue-500 hover:underline mb-3 inline-block text-sm">
        ← 戻る
      </Link>

      <h1 className="text-xl md:text-2xl font-bold mb-4">教材リクエスト</h1>

      {error && (
        <div className="bg-red-900/30 border border-red-500/50 text-red-300 px-3 py-2 rounded-lg mb-3 text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-900/30 border border-green-500/50 text-green-300 px-3 py-2 rounded-lg mb-3 text-sm">
          リクエストを送信しました！
        </div>
      )}

      <div
        className="rounded-lg p-4 md:p-6"
        style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
      >
        <div className="space-y-4 md:space-y-6">
          {/* URL Input */}
          <div>
            <label className="block mb-1.5 font-medium text-sm">YouTube URL</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{
                background: "var(--input-bg)",
                border: "1px solid var(--input-border)",
                color: "var(--foreground)",
              }}
            />
          </div>

          {/* Video + Time Controls — designed to fit one mobile screen */}
          {videoId && (
            <div className="space-y-2">
              {/* Compact Video Player */}
              <div className="aspect-video bg-black rounded-lg overflow-hidden shadow-md">
                <div id="request-youtube-player" className="w-full h-full" />
              </div>

              {/* Compact Time Control Bar */}
              <div className="flex gap-2 items-center">
                {/* Set Start Button */}
                <button
                  onClick={handleSetStart}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 py-2.5 px-3 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800/50 transition text-xs font-bold"
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                  </svg>
                  <span>開始</span>
                  <span className="font-mono opacity-70">{formatTime(startTime)}</span>
                </button>

                {/* Duration Display */}
                <div className="text-center px-2 shrink-0">
                  <div className="text-xs font-mono font-bold opacity-80">{endTime - startTime}秒</div>
                </div>

                {/* Set End Button */}
                <button
                  onClick={handleSetEnd}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 py-2.5 px-3 rounded-lg hover:bg-red-200 dark:hover:bg-red-800/50 transition text-xs font-bold"
                >
                  <span>終了</span>
                  <span className="font-mono opacity-70">{formatTime(endTime)}</span>
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block mb-1.5 font-medium text-sm">
              タイトル{fetchingTitle && <span className="text-xs opacity-60 ml-2">取得中...</span>}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="空欄でYouTubeから自動取得"
              className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{
                background: "var(--input-bg)",
                border: "1px solid var(--input-border)",
                color: "var(--foreground)",
              }}
            />
          </div>

          {/* Fine-tune Sliders (collapsible feel) */}
          <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
            <p className="text-xs font-medium text-gray-500 mb-3">スライダーで微調整</p>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>開始</span>
                  <span className="font-mono">{formatTime(startTime)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={600}
                  step={1}
                  value={startTime}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setStartTime(v);
                    if (endTime - v < 30) setEndTime(Math.min(v + 30, 600));
                    if (endTime - v > 180) setEndTime(v + 180);
                  }}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                  style={{ background: "var(--input-border)" }}
                />
              </div>
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>終了</span>
                  <span className="font-mono">{formatTime(endTime)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={600}
                  step={1}
                  value={endTime}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setEndTime(v);
                    if (v - startTime < 30) setStartTime(Math.max(v - 30, 0));
                    if (v - startTime > 180) setStartTime(v - 180);
                  }}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                  style={{ background: "var(--input-border)" }}
                />
              </div>
              <div className="text-center text-xs opacity-50">
                {formatTime(startTime)} 〜 {formatTime(endTime)}（{endTime - startTime}秒 / 30〜180秒）
              </div>
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={submitRequest}
            disabled={loading || !url}
            className="w-full bg-blue-600 text-white px-6 py-3.5 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-bold text-base shadow-md"
          >
            {loading ? "送信中..." : "リクエストを送信"}
          </button>
        </div>
      </div>
    </div>
  );
}
