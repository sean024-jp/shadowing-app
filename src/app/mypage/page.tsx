"use client";

import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { useCallback, useState } from "react";
import Link from "next/link";
import { Material, MaterialRequest, PracticeRecording } from "@/types/models";
import { MaterialCard } from "@/components/MaterialCard";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { PAGE_SIZES } from "@/lib/constants";

type Tab = "favorites" | "requests" | "recordings";

export default function MyPage() {
    const { user, signOut } = useAuth();
    const [activeTab, setActiveTab] = useState<Tab>("favorites");

    // Favorites infinite scroll
    const fetchFavoritesPage = useCallback(async (page: number, pageSize: number) => {
        if (!user) return { data: [] as Material[], hasMore: false };
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data, count } = await supabase
            .from("user_favorites")
            .select("material_id, materials(*)", { count: "exact" })
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .range(from, to);

        const mats = (data || []).map((d: any) => d.materials).filter(Boolean) as Material[];
        const total = count || 0;
        return { data: mats, hasMore: from + (data?.length || 0) < total };
    }, [user]);

    const favScroll = useInfiniteScroll(fetchFavoritesPage, {
        pageSize: PAGE_SIZES.HOME_GRID,
        enabled: !!user && activeTab === "favorites",
    });

    // Recordings infinite scroll
    const fetchRecordingsPage = useCallback(async (page: number, pageSize: number) => {
        if (!user) return { data: [] as (PracticeRecording & { materials: Material; signedUrl?: string })[], hasMore: false };
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data, count } = await supabase
            .from("practice_recordings")
            .select("*, materials(*)", { count: "exact" })
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .range(from, to);

        const recordingsWithUrl = await Promise.all(
            (data || []).map(async (rec: any) => {
                const { data: signedData } = await supabase.storage
                    .from("practice-recordings")
                    .createSignedUrl(rec.audio_path, 3600);
                return { ...rec, signedUrl: signedData?.signedUrl };
            })
        );

        const total = count || 0;
        return { data: recordingsWithUrl, hasMore: from + (data?.length || 0) < total };
    }, [user]);

    const recScroll = useInfiniteScroll(fetchRecordingsPage, {
        pageSize: PAGE_SIZES.LIST,
        enabled: !!user && activeTab === "recordings",
    });

    // Requests infinite scroll
    const fetchRequestsPage = useCallback(async (page: number, pageSize: number) => {
        if (!user) return { data: [] as MaterialRequest[], hasMore: false };
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data, count } = await supabase
            .from("material_requests")
            .select("*", { count: "exact" })
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .range(from, to);

        const total = count || 0;
        return { data: (data || []) as MaterialRequest[], hasMore: from + (data?.length || 0) < total };
    }, [user]);

    const reqScroll = useInfiniteScroll(fetchRequestsPage, {
        pageSize: PAGE_SIZES.LIST,
        enabled: !!user && activeTab === "requests",
    });

    const removeFavorite = async (materialId: string) => {
        if (!user || !confirm("お気に入りから削除しますか？")) return;

        await supabase
            .from("user_favorites")
            .delete()
            .eq("user_id", user.id)
            .eq("material_id", materialId);

        favScroll.reset();
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
        { id: "recordings", label: "録音履歴" },
        { id: "requests", label: "リクエスト" },
    ];

    const renderLoadingMore = (scroll: { isLoadingMore: boolean; hasMore: boolean; sentinelRef: (node: HTMLDivElement | null) => void }) => (
        <>
            {scroll.isLoadingMore && (
                <div className="flex justify-center py-6">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                </div>
            )}
            {scroll.hasMore && <div ref={scroll.sentinelRef} className="h-1" />}
        </>
    );

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
            <div className="space-y-4">
                {/* Favorites Tab */}
                {activeTab === "favorites" && (
                    <>
                        {favScroll.isLoading ? (
                            <div className="text-center py-12">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                            </div>
                        ) : favScroll.items.length === 0 ? (
                            <p className="text-center text-gray-500 py-8">お気に入りの教材はありません</p>
                        ) : (
                            <>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {favScroll.items.map((material) => (
                                        <MaterialCard
                                            key={material.id}
                                            material={material}
                                            isFavorite={true}
                                            onToggleFavorite={removeFavorite}
                                        />
                                    ))}
                                </div>
                                {renderLoadingMore(favScroll)}
                            </>
                        )}
                    </>
                )}

                {/* Requests Tab */}
                {activeTab === "requests" && (
                    <>
                        {reqScroll.isLoading ? (
                            <div className="text-center py-12">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                            </div>
                        ) : reqScroll.items.length === 0 ? (
                            <p className="text-center text-gray-500 py-8">リクエスト履歴はありません</p>
                        ) : (
                            <>
                                <div className="grid gap-4">
                                    {reqScroll.items.map((req) => (
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
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {renderLoadingMore(reqScroll)}
                            </>
                        )}
                    </>
                )}

                {/* Recordings Tab */}
                {activeTab === "recordings" && (
                    <>
                        {recScroll.isLoading ? (
                            <div className="text-center py-12">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                            </div>
                        ) : recScroll.items.length === 0 ? (
                            <p className="text-center text-gray-500 py-8">録音履歴はありません</p>
                        ) : (
                            <>
                                <div className="grid gap-4">
                                    {recScroll.items.map((rec) => (
                                        <div
                                            key={rec.id}
                                            className="rounded-lg p-4 hover:shadow-md transition"
                                            style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
                                        >
                                            <div className="flex items-start gap-4 mb-3">
                                                <Link href={`/practice/${rec.materials.id}`} className="shrink-0">
                                                    <img
                                                        src={`https://img.youtube.com/vi/${rec.materials.youtube_id}/mqdefault.jpg`}
                                                        alt={rec.materials.title}
                                                        className="w-24 h-18 object-cover rounded hover:opacity-80 transition"
                                                    />
                                                </Link>
                                                <div className="flex-1 min-w-0">
                                                    <Link
                                                        href={`/practice/${rec.materials.id}`}
                                                        className="font-bold text-gray-800 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 line-clamp-2 leading-tight block mb-2"
                                                    >
                                                        {rec.materials.title}
                                                    </Link>
                                                    <div className="flex flex-wrap items-center gap-2 mb-2">
                                                        {rec.materials.wpm && (
                                                            <span className="text-xs font-bold px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                                                                {rec.materials.wpm} WPM
                                                            </span>
                                                        )}
                                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                                            {Math.floor((rec.materials.end_time - rec.materials.start_time))}秒
                                                        </span>
                                                    </div>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                                                        <svg className="w-4 h-4 inline-block mr-1 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                        {new Date(rec.created_at).toLocaleString("ja-JP")}
                                                    </p>
                                                </div>
                                            </div>

                                            {rec.signedUrl && (
                                                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                                                    <audio
                                                        controls
                                                        src={rec.signedUrl}
                                                        className="w-full h-10"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                {renderLoadingMore(recScroll)}
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
