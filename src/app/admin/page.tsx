"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { DifficultyBadge } from "@/components/DifficultyBadge";
import type { Difficulty, TranscriptItem } from "@/types/models";
import { calculateWPM, getWPMLabel } from "@/lib/wpm";

type MaterialRequest = {
  id: string;
  youtube_url: string;
  youtube_id: string;
  title: string | null;
  difficulty: Difficulty | null;
  start_time: number;
  end_time: number | null;
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
  const [transcriptJa, setTranscriptJa] = useState<TranscriptItem[]>([]);
  const [title, setTitle] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("beginner");
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(60);
  const [fetchingTranscript, setFetchingTranscript] = useState(false);

  const isAdmin = Boolean(user?.email && ADMIN_EMAIL && user.email.toLowerCase().trim() === ADMIN_EMAIL.toLowerCase().trim());

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

  const fetchTranscriptData = async (req: MaterialRequest) => {
    setError("");
    setFetchingTranscript(true);
    setEditingRequest(req);
    setTitle(req.title || "");
    setDifficulty(req.difficulty || "beginner");
    setStartTime(req.start_time || 0);
    setEndTime(req.end_time || 60);

    try {
      const res = await fetch(`/api/transcript?videoId=${req.youtube_id}&multiLang=true`);
      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "字幕を取得できませんでした");
      }

      const enTranscript = data.en || [];
      const jaTranscript = data.ja || [];

      if (enTranscript.length === 0) {
        throw new Error("英語字幕データが見つかりませんでした");
      }

      setTranscript(enTranscript);
      setTranscriptJa(jaTranscript);
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

  const getSelectedTranscript = (items: TranscriptItem[]) => {
    const start = startTime * 1000;
    const end = endTime * 1000;
    return items.filter(
      (item) => item.offset >= start && item.offset < end
    );
  };

  const approve = async () => {
    if (!editingRequest || !user) return;

    setProcessingId(editingRequest.id);
    setError("");

    const selectedEn = getSelectedTranscript(transcript);
    const selectedJa = getSelectedTranscript(transcriptJa);
    const wpm = calculateWPM(selectedEn, startTime, endTime);

    const { error: saveError } = await supabase.from("materials").insert({
      user_id: user.id,
      youtube_url: editingRequest.youtube_url,
      youtube_id: editingRequest.youtube_id,
      title: title || `YouTube教材 ${new Date().toLocaleDateString("ja-JP")}`,
      start_time: startTime,
      end_time: endTime,
      transcript: selectedEn,
      transcript_ja: selectedJa.length > 0 ? selectedJa : null,
      difficulty,
      wpm,
    });

    if (saveError) {
      setError("教材の保存に失敗しました: " + saveError.message);
      setProcessingId(null);
      return;
    }

    await supabase
      .from("material_requests")
      .update({ status: "approved" })
      .eq("id", editingRequest.id);

    setSuccess(`「${title}」を教材として追加しました`);
    setEditingRequest(null);
    setTranscript([]);
    setTranscriptJa([]);
    setStartTime(0);
    setEndTime(60);
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
    setTranscriptJa([]);
    setStartTime(0);
    setEndTime(60);
    setError("");
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const maxStartTime = Math.max(0, totalDuration - 30);

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
    <div className="max-w-4xl mx-auto p-4 md:p-6 pb-20">
      <Link href="/" className="text-blue-500 hover:underline mb-3 inline-block text-sm">
        ← 戻る
      </Link>

      <h1 className="text-lg md:text-2xl font-bold mb-4 md:mb-6">管理者: リクエスト一覧</h1>

      {error && (
        <div className="bg-red-900/30 border border-red-500/50 text-red-300 px-3 py-2 rounded-lg mb-3 text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-900/30 border border-green-500/50 text-green-300 px-3 py-2 rounded-lg mb-3 text-sm">
          {success}
        </div>
      )}

      {/* Editing / Approval Form */}
      {editingRequest && (
        <div
          className="rounded-lg p-4 md:p-6 mb-4 md:mb-6"
          style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
        >
          <h2 className="font-bold text-base md:text-lg mb-4">教材を承認</h2>

          {fetchingTranscript ? (
            <div className="flex items-center gap-2 py-8 justify-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
              <span className="text-sm">字幕を取得中...</span>
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
                <label className="block mb-1.5 font-medium text-sm">タイトル</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="教材のタイトル"
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{
                    background: "var(--input-bg)",
                    border: "1px solid var(--input-border)",
                    color: "var(--foreground)",
                  }}
                />
              </div>

              <div>
                <label className="block mb-1.5 font-medium text-sm">難易度</label>
                <div className="flex gap-2">
                  {(["beginner", "intermediate", "advanced"] as Difficulty[]).map((d) => (
                    <button
                      key={d}
                      onClick={() => setDifficulty(d)}
                      className={`flex-1 px-3 py-2 rounded-lg transition text-sm ${difficulty === d ? "bg-blue-600 text-white" : ""
                        }`}
                      style={
                        difficulty !== d
                          ? { background: "var(--input-bg)", border: "1px solid var(--input-border)" }
                          : undefined
                      }
                    >
                      {d === "beginner" ? "初級" : d === "intermediate" ? "中級" : "上級"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-gray-500">
                    範囲: {formatTime(startTime)} 〜 {formatTime(endTime)}（{endTime - startTime}秒）
                  </p>
                  {getSelectedTranscript(transcript).length > 0 && (
                    <p className="text-xs font-bold text-blue-600 dark:text-blue-400">
                      {calculateWPM(getSelectedTranscript(transcript), startTime, endTime)} WPM ({getWPMLabel(calculateWPM(getSelectedTranscript(transcript), startTime, endTime))})
                    </p>
                  )}
                </div>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>開始</span>
                      <span className="font-mono">{formatTime(startTime)}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(maxStartTime, totalDuration)}
                      step={1}
                      value={startTime}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setStartTime(v);
                        if (endTime - v < 30) setEndTime(Math.min(v + 30, totalDuration));
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
                      min={30}
                      max={totalDuration}
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
                </div>
              </div>

              {/* English transcript preview */}
              <div>
                <h3 className="font-medium text-sm mb-2">英語スクリプト</h3>
                <div
                  className="rounded-lg p-3 max-h-32 overflow-y-auto text-sm"
                  style={{ background: "var(--background)" }}
                >
                  {getSelectedTranscript(transcript).length > 0 ? (
                    getSelectedTranscript(transcript).map((item, idx) => (
                      <span key={idx} className="mr-1">
                        {item.text}
                      </span>
                    ))
                  ) : (
                    <p className="opacity-60">この範囲に英語スクリプトがありません</p>
                  )}
                </div>
              </div>

              {/* Japanese transcript preview */}
              <div>
                <h3 className="font-medium text-sm mb-2">
                  日本語スクリプト
                  {transcriptJa.length === 0 && (
                    <span className="text-xs opacity-60 ml-2">（なし）</span>
                  )}
                </h3>
                <div
                  className="rounded-lg p-3 max-h-32 overflow-y-auto text-sm"
                  style={{ background: "var(--background)" }}
                >
                  {getSelectedTranscript(transcriptJa).length > 0 ? (
                    getSelectedTranscript(transcriptJa).map((item, idx) => (
                      <span key={idx} className="mr-1">
                        {item.text}
                      </span>
                    ))
                  ) : (
                    <p className="opacity-60">この範囲に日本語スクリプトがありません</p>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={cancelEditing}
                  className="flex-1 px-4 py-2.5 rounded-lg transition text-sm"
                  style={{ border: "1px solid var(--card-border)" }}
                >
                  キャンセル
                </button>
                <button
                  onClick={approve}
                  disabled={processingId === editingRequest.id || getSelectedTranscript(transcript).length === 0}
                  className="flex-1 bg-green-600 text-white px-4 py-2.5 rounded-lg hover:bg-green-700 transition disabled:opacity-50 text-sm font-bold"
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
        <div className="grid gap-3 md:gap-4">
          {requests.map((req) => (
            <div
              key={req.id}
              className="rounded-lg p-3 md:p-4"
              style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
            >
              {/* Top: Thumbnail + Info */}
              <div className="flex gap-3 mb-3">
                <img
                  src={`https://img.youtube.com/vi/${req.youtube_id}/mqdefault.jpg`}
                  alt={req.title || "リクエスト"}
                  className="w-24 h-16 md:w-32 md:h-20 object-cover rounded shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 mb-1">
                    <h3 className="font-medium text-sm md:text-base line-clamp-2">{req.title || "タイトル未設定"}</h3>
                    <DifficultyBadge difficulty={req.difficulty} />
                  </div>
                  <p className="text-xs opacity-60">
                    {new Date(req.created_at).toLocaleDateString("ja-JP")}
                    {req.start_time !== undefined && req.end_time && (
                      <span className="ml-2">
                        {formatTime(req.start_time)} 〜 {formatTime(req.end_time)}
                      </span>
                    )}
                  </p>
                  <p className="text-xs opacity-40 mt-0.5 truncate">{req.youtube_url}</p>
                </div>
              </div>
              {/* Bottom: Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => fetchTranscriptData(req)}
                  disabled={editingRequest !== null}
                  className="flex-1 bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 transition text-sm font-bold disabled:opacity-50"
                >
                  承認
                </button>
                <button
                  onClick={() => reject(req.id)}
                  className="px-4 py-2 text-red-500 hover:text-red-400 text-sm rounded-lg border border-red-500/30 hover:border-red-500/50 transition"
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
