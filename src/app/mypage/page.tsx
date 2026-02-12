"use client";

import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Material, MaterialRequest, PracticeHistory, PracticeRecording } from "@/types/models";
import { MaterialCard } from "@/components/MaterialCard";
import { DifficultyBadge } from "@/components/DifficultyBadge";

type Tab = "favorites" | "history" | "requests" | "recordings";

export default function MyPage() {
    const { user, signOut } = useAuth();
    const [activeTab, setActiveTab] = useState<Tab>("favorites");
    const [loading, setLoading] = useState(true);

    // Data states
    const [favorites, setFavorites] = useState<Material[]>([]);
    const [history, setHistory] = useState<(PracticeHistory & { materials: Material })[]>([]);
    const [requests, setRequests] = useState<MaterialRequest[]>([]);
    const [recordings, setRecordings] = useState<(PracticeRecording & { materials: Material; signedUrl?: string })[]>([]);

    useEffect(() => {
        if (user) {
            loadData();
        }
    }, [user, activeTab]);

    const loadData = async () => {
        setLoading(true);
        if (!user) return;

        try {
            if (activeTab === "favorites") {
                const { data } = await supabase
                    .from("user_favorites")
                    .select("material_id, materials(*)")
                    .eq("user_id", user.id)
                    .order("created_at", { ascending: false });

                if (data) {
                    // Flatten the structure
                    const mats = data.map((d: any) => d.materials).filter(Boolean);
                    setFavorites(mats);
                }
            } else if (activeTab === "history") {
                const { data } = await supabase
                    .from("practice_history")
                    .select("*, materials(*)")
                    .eq("user_id", user.id)
                    .order("practiced_at", { ascending: false });

                if (data) setHistory(data as any);
            } else if (activeTab === "requests") {
                const { data } = await supabase
                    .from("material_requests")
                    .select("*")
                    .eq("user_id", user.id)
                    .order("created_at", { ascending: false });

                if (data) setRequests(data as any);
            } else if (activeTab === "recordings") {
                const { data } = await supabase
                    .from("practice_recordings")
                    .select("*, materials(*)")
                    .eq("user_id", user.id)
                    .order("created_at", { ascending: false });

                if (data) {
                    // Generate signed URLs for audio
                    const recordingsWithUrl = await Promise.all(
                        data.map(async (rec: any) => {
                            const { data: signedData } = await supabase.storage
                                .from("practice-recordings")
                                .createSignedUrl(rec.audio_path, 3600);
                            return { ...rec, signedUrl: signedData?.signedUrl };
                        })
                    );
                    setRecordings(recordingsWithUrl);
                }
            }
        } catch (error) {
            console.error("Error loading data:", error);
        } finally {
            setLoading(false);
        }
    };

    const removeFavorite = async (materialId: string) => {
        if (!user || !confirm("お気に入りから削除しますか？")) return;

        await supabase
            .from("user_favorites")
            .delete()
            .eq("user_id", user.id)
            .eq("material_id", materialId);

        loadData(); // Reload
    };

    if (!user) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Link href="/" className="text-blue-600 hover:underline">
                    ログインしてください
                </Link>
            </div>
        );
    }

    const tabs: { id: Tab; label: string }[] = [
        { id: "favorites", label: "お気に入り" },
        { id: "history", label: "練習履歴" }, // Technically practice history
        { id: "recordings", label: "録音" },
        { id: "requests", label: "リクエスト" },
    ];

    return (
        <div className="max-w-4xl mx-auto p-6">
            <div className="flex items-center justify-between mb-6 md:mb-8 sticky top-0 z-10 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md py-3 -mx-6 px-6 md:mx-0 md:px-0 border-b md:border-none border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-3 md:gap-4 shrink-0 overflow-hidden">
                    <Link href="/" className="text-blue-600 hover:underline text-sm font-medium whitespace-nowrap shrink-0">
                        ← ホーム
                    </Link>
                    <h1 className="text-xl md:text-2xl font-bold truncate">マイページ</h1>
                </div>
                <div className="flex items-center gap-4">
                    <div className="hidden sm:block text-sm text-gray-500">{user.email}</div>
                    <button
                        onClick={signOut}
                        className="text-sm text-red-500 hover:text-red-700 flex items-center gap-1 font-medium"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        ログアウト
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-6 py-3 text-sm font-medium whitespace-nowrap transition-colors relative ${activeTab === tab.id
                            ? "text-blue-600"
                            : "text-gray-500 hover:text-gray-700"
                            }`}
                    >
                        {tab.label}
                        {activeTab === tab.id && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                        )}
                    </button>
                ))}
            </div>

            {/* Content */}
            {loading ? (
                <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Favorites Tab */}
                    {activeTab === "favorites" && (
                        <>
                            {favorites.length === 0 ? (
                                <p className="text-center text-gray-500 py-8">お気に入りの教材はありません</p>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {favorites.map((material) => (
                                        <MaterialCard
                                            key={material.id}
                                            material={material}
                                            isFavorite={true}
                                            onToggleFavorite={removeFavorite}
                                        />
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {/* History Tab */}
                    {activeTab === "history" && (
                        <>
                            {history.length === 0 ? (
                                <p className="text-center text-gray-500 py-8">練習履歴はありません</p>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {history.map((item) => (
                                        <div key={item.id} className="relative">
                                            <MaterialCard
                                                material={item.materials}
                                                isFavorite={false} // Would need to fetch fav status separately or join fancier
                                                onToggleFavorite={() => { }} // Disabled in history view for simplicity or add logic
                                            />
                                            <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded backdrop-blur-sm">
                                                {new Date(item.practiced_at).toLocaleString("ja-JP")}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {/* Requests Tab */}
                    {activeTab === "requests" && (
                        <>
                            {requests.length === 0 ? (
                                <p className="text-center text-gray-500 py-8">リクエスト履歴はありません</p>
                            ) : (
                                <div className="grid gap-4">
                                    {requests.map((req) => (
                                        <div
                                            key={req.id}
                                            className="rounded-lg p-4"
                                            style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <h3 className="font-bold text-gray-800 dark:text-gray-100 line-clamp-1">
                                                    {req.title || "（タイトル未設定）"}
                                                </h3>
                                                <span
                                                    className={`text-xs font-bold px-2 py-1 rounded ${req.status === "approved"
                                                        ? "bg-green-100 text-green-700"
                                                        : req.status === "rejected"
                                                            ? "bg-red-100 text-red-700"
                                                            : "bg-yellow-100 text-yellow-700"
                                                        }`}
                                                >
                                                    {req.status === "approved"
                                                        ? "承認済み"
                                                        : req.status === "rejected"
                                                            ? "却下"
                                                            : "申請中"}
                                                </span>
                                            </div>
                                            <a
                                                href={req.youtube_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-sm text-blue-500 hover:underline block mb-2 truncate"
                                            >
                                                {req.youtube_url}
                                            </a>
                                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                                <span>{new Date(req.created_at).toLocaleDateString("ja-JP")}</span>
                                                {req.difficulty && <DifficultyBadge difficulty={req.difficulty} />}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {/* Recordings Tab */}
                    {activeTab === "recordings" && (
                        <>
                            {recordings.length === 0 ? (
                                <p className="text-center text-gray-500 py-8">録音データはありません</p>
                            ) : (
                                <div className="grid gap-4">
                                    {recordings.map((rec) => (
                                        <div
                                            key={rec.id}
                                            className="rounded-lg p-4"
                                            style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
                                        >
                                            <div className="flex items-center gap-4 mb-3">
                                                <img
                                                    src={`https://img.youtube.com/vi/${rec.materials.youtube_id}/default.jpg`}
                                                    alt={rec.materials.title}
                                                    className="w-16 h-12 object-cover rounded"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="font-bold text-gray-800 truncate">
                                                        {rec.materials.title}
                                                    </h3>
                                                    <p className="text-xs text-gray-500">
                                                        {new Date(rec.created_at).toLocaleString("ja-JP")}
                                                    </p>
                                                </div>
                                            </div>

                                            {rec.signedUrl && (
                                                <audio
                                                    controls
                                                    src={rec.signedUrl}
                                                    className="w-full h-10"
                                                />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
