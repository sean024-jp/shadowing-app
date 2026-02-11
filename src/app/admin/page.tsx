"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";

type TranscriptItem = {
  text: string;
  offset: number;
  duration: number;
};

type MaterialRequest = {
  id: string;
  youtube_url: string;
  youtube_id: string;
  title: string | null;
  status: string;
  created_at: string;
};

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL;

export default function AdminPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Approval form state
  const [editingRequest, setEditingRequest] = useState<MaterialRequest | null>(null);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState(0);
  const [fetchingTranscript, setFetchingTranscript] = useState(false);

  const isAdmin = user?.email === ADMIN_EMAIL;

  useEffect(() => {
    if (isAdmin) {
      loadRequests();
    }
  }, [isAdmin]);

  const loadRequests = async () => {
    const { data } = await supabase
      .from("material_requests")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    setRequests(data || []);
    setLoading(false);
  };

  const fetchTranscript = async (req: MaterialRequest) => {
    setError("");
    setFetchingTranscript(true);
    setEditingRequest(req);
    setTitle(req.title || "");

    try {
      const res = await fetch(`/api/transcript?videoId=${req.youtube_id}`);
      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "字幕を取得できませんでした");
      }

      if (!Array.isArray(data) || data.length === 0) {
        throw new Error("字幕データが見つかりませんでした");
      }

      setTranscript(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
      setEditingRequest(null);
    } finally {
      setFetchingTranscript(false);
    }
  };

  const totalDuration =
    transcript.length > 0
      ? Math.ceil(
          (transcript[transcript.length - 1].offset +
            transcript[transcript.length - 1].duration) /
            1000
        )
      : 0;

  const getEndTime = () => Math.min(startTime + 60, totalDuration);

  const getSelectedTranscript = () => {
    const start = startTime * 1000;
    const end = getEndTime() * 1000;
    return transcript.filter(
      (item) => item.offset >= start && item.offset < end
    );
  };

  const approve = async () => {
    if (!editingRequest || !user) return;

    setProcessingId(editingRequest.id);
    setError("");

    const selectedTranscript = getSelectedTranscript();

    // Save as material
    const { error: saveError } = await supabase.from("materials").insert({
      user_id: user.id,
      youtube_url: editingRequest.youtube_url,
      youtube_id: editingRequest.youtube_id,
      title: title || `YouTube教材 ${new Date().toLocaleDateString("ja-JP")}`,
      start_time: startTime,
      end_time: getEndTime(),
      transcript: selectedTranscript,
    });

    if (saveError) {
      setError("教材の保存に失敗しました: " + saveError.message);
      setProcessingId(null);
      return;
    }

    // Update request status
    await supabase
      .from("material_requests")
      .update({ status: "approved" })
      .eq("id", editingRequest.id);

    setSuccess(`「${title}」を教材として追加しました`);
    setEditingRequest(null);
    setTranscript([]);
    setStartTime(0);
    setProcessingId(null);
    loadRequests();
  };

  const reject = async (id: string) => {
    if (!confirm("このリクエストを却下しますか？")) return;

    await supabase
      .from("material_requests")
      .update({ status: "rejected" })
      .eq("id", id);

    loadRequests();
  };

  const cancelEditing = () => {
    setEditingRequest(null);
    setTranscript([]);
    setStartTime(0);
    setError("");
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const maxStartTime = Math.max(0, totalDuration - 60);

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>ログインしてください</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-red-400">管理者権限がありません</p>
        <Link href="/" className="text-blue-500 hover:underline">
          ホームに戻る
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Link href="/" className="text-blue-500 hover:underline mb-4 inline-block">
        ← 戻る
      </Link>

      <h1 className="text-2xl font-bold mb-6">管理者: 教材リクエスト一覧</h1>

      {error && (
        <div className="bg-red-900/30 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-900/30 border border-green-500/50 text-green-300 px-4 py-3 rounded-lg mb-4">
          {success}
        </div>
      )}

      {/* Editing / Approval Form */}
      {editingRequest && (
        <div
          className="rounded-lg p-6 mb-6"
          style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
        >
          <h2 className="font-bold text-lg mb-4">教材を承認</h2>

          {fetchingTranscript ? (
            <div className="flex items-center gap-2 py-8 justify-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
              <span>字幕を取得中...</span>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="aspect-video">
                <iframe
                  width="100%"
                  height="100%"
                  src={`https://www.youtube.com/embed/${editingRequest.youtube_id}?start=${startTime}`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="rounded-lg"
                />
              </div>

              <div>
                <label className="block mb-2 font-medium">タイトル</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="教材のタイトル"
                  className="w-full rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{
                    background: "var(--input-bg)",
                    border: "1px solid var(--input-border)",
                    color: "var(--foreground)",
                  }}
                />
              </div>

              <div>
                <label className="block mb-2 font-medium">
                  開始位置: {formatTime(startTime)} 〜 {formatTime(getEndTime())} （1分間）
                </label>
                {maxStartTime > 0 ? (
                  <>
                    <input
                      type="range"
                      min={0}
                      max={maxStartTime}
                      step={1}
                      value={startTime}
                      onChange={(e) => setStartTime(Number(e.target.value))}
                      className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                      style={{ background: "#4b5563" }}
                    />
                    <div className="flex justify-between text-sm opacity-60 mt-1">
                      <span>0:00</span>
                      <span>{formatTime(totalDuration)}</span>
                    </div>
                  </>
                ) : (
                  <p className="text-sm opacity-60">
                    動画が1分以下のため、全体が選択されています
                  </p>
                )}
              </div>

              <div
                className="rounded-lg p-4 max-h-60 overflow-y-auto"
                style={{ background: "var(--background)" }}
              >
                {getSelectedTranscript().length > 0 ? (
                  getSelectedTranscript().map((item, idx) => (
                    <span key={idx} className="mr-1">
                      {item.text}
                    </span>
                  ))
                ) : (
                  <p className="opacity-60">この範囲にスクリプトがありません</p>
                )}
              </div>

              <div className="flex gap-4">
                <button
                  onClick={cancelEditing}
                  className="px-6 py-3 rounded-lg transition"
                  style={{ border: "1px solid var(--card-border)" }}
                >
                  キャンセル
                </button>
                <button
                  onClick={approve}
                  disabled={processingId === editingRequest.id || getSelectedTranscript().length === 0}
                  className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition disabled:opacity-50"
                >
                  {processingId === editingRequest.id ? "保存中..." : "教材として追加"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Request List */}
      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
        </div>
      ) : requests.length === 0 ? (
        <div
          className="text-center py-12 rounded-lg"
          style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
        >
          <p className="opacity-60">保留中のリクエストはありません</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {requests.map((req) => (
            <div
              key={req.id}
              className="rounded-lg p-4 flex items-center gap-4"
              style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
            >
              <img
                src={`https://img.youtube.com/vi/${req.youtube_id}/mqdefault.jpg`}
                alt={req.title || "リクエスト"}
                className="w-32 h-20 object-cover rounded"
              />
              <div className="flex-1">
                <h3 className="font-medium">{req.title || "タイトル未設定"}</h3>
                <p className="text-sm opacity-60">
                  {new Date(req.created_at).toLocaleDateString("ja-JP")}
                </p>
                <p className="text-xs opacity-40 mt-1">{req.youtube_url}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchTranscript(req)}
                  disabled={editingRequest !== null}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition text-sm disabled:opacity-50"
                >
                  承認
                </button>
                <button
                  onClick={() => reject(req.id)}
                  className="text-red-500 hover:text-red-400 px-4 py-2 text-sm"
                >
                  却下
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
