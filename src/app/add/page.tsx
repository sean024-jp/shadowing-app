"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";

export default function RequestPage() {
  const { user } = useAuth();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const extractVideoId = (url: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  const submitRequest = async () => {
    setError("");
    setSuccess(false);

    const videoId = extractVideoId(url);
    if (!videoId) {
      setError("無効なYouTube URLです");
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
      });

    if (insertError) {
      setError("リクエストの送信に失敗しました: " + insertError.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setUrl("");
    setTitle("");
    setLoading(false);
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>ログインしてください</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Link href="/" className="text-blue-500 hover:underline mb-4 inline-block">
        ← 戻る
      </Link>

      <h1 className="text-2xl font-bold mb-6">教材リクエスト</h1>

      {error && (
        <div className="bg-red-900/30 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-900/30 border border-green-500/50 text-green-300 px-4 py-3 rounded-lg mb-4">
          リクエストを送信しました。管理者が確認後、教材として追加されます。
        </div>
      )}

      <div
        className="rounded-lg p-6"
        style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
      >
        <div className="space-y-4">
          <div>
            <label className="block mb-2 font-medium">YouTube URL</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{
                background: "var(--input-bg)",
                border: "1px solid var(--input-border)",
                color: "var(--foreground)",
              }}
            />
          </div>

          <div>
            <label className="block mb-2 font-medium">タイトル（任意）</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="教材のタイトル（空欄の場合は管理者が設定）"
              className="w-full rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{
                background: "var(--input-bg)",
                border: "1px solid var(--input-border)",
                color: "var(--foreground)",
              }}
            />
          </div>

          {url && extractVideoId(url) && (
            <div className="aspect-video">
              <iframe
                width="100%"
                height="100%"
                src={`https://www.youtube.com/embed/${extractVideoId(url)}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="rounded-lg"
              />
            </div>
          )}

          <button
            onClick={submitRequest}
            disabled={loading || !url}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "送信中..." : "リクエストを送信"}
          </button>
        </div>
      </div>
    </div>
  );
}
