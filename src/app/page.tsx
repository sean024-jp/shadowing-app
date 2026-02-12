"use client";

import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Material, Difficulty } from "@/types/models";
import { MaterialCard } from "@/components/MaterialCard";

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL;

const DIFFICULTY_FILTERS: { value: Difficulty | "all"; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "beginner", label: "初級" },
  { value: "intermediate", label: "中級" },
  { value: "advanced", label: "上級" },
];

export default function Home() {
  const { user, loading, signInWithGoogle, signOut } = useAuth();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [difficultyFilter, setDifficultyFilter] = useState<Difficulty | "all">("all");

  const isAdmin = Boolean(user?.email && ADMIN_EMAIL && user.email.toLowerCase().trim() === ADMIN_EMAIL.toLowerCase().trim());

  useEffect(() => {
    if (user) {
      loadMaterials();
      loadFavorites();
    }
  }, [user]);

  const loadMaterials = async () => {
    setLoadingMaterials(true);
    const { data } = await supabase
      .from("materials")
      .select("*")
      .order("favorite_count", { ascending: false })
      .order("created_at", { ascending: false });
    setMaterials(data || []);
    setLoadingMaterials(false);
  };

  const loadFavorites = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("user_favorites")
      .select("material_id")
      .eq("user_id", user.id);
    setFavoriteIds(new Set((data || []).map((f) => f.material_id)));
  };

  const toggleFavorite = async (materialId: string) => {
    if (!user) return;
    const isFav = favoriteIds.has(materialId);

    // Optimistic update for UI (Icon)
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (isFav) next.delete(materialId);
      else next.add(materialId);
      return next;
    });

    // Optimistic update for Count
    setMaterials((prev) =>
      prev.map((m) =>
        m.id === materialId
          ? { ...m, favorite_count: m.favorite_count + (isFav ? -1 : 1) }
          : m
      )
    );

    // DB Update
    if (isFav) {
      await supabase
        .from("user_favorites")
        .delete()
        .eq("user_id", user.id)
        .eq("material_id", materialId);
    } else {
      // Enforce 50 favorites limit (Optional: Logic preserved but maybe simpler to just alert if fail? Keeping silent enforcement for now)
      if (favoriteIds.size >= 50) {
        const { data: oldest } = await supabase
          .from("user_favorites")
          .select("id")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true })
          .limit(1);
        if (oldest && oldest.length > 0) {
          await supabase.from("user_favorites").delete().eq("id", oldest[0].id);
        }
      }
      await supabase
        .from("user_favorites")
        .insert({ user_id: user.id, material_id: materialId });
    }
  };

  const deleteMaterial = async (id: string) => {
    if (!confirm("この教材を削除しますか？")) return;
    await supabase.from("materials").delete().eq("id", id);
    loadMaterials();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6">
        <h1 className="text-3xl font-bold">Shadowing Market</h1>
        <p className="opacity-70">YouTube動画でシャドーイング練習</p>
        <button
          onClick={signInWithGoogle}
          className="flex items-center gap-2 rounded-lg px-6 py-3 transition shadow-sm"
          style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Googleでログイン
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 pb-20 md:pb-6">
      <header className="flex items-center justify-between mb-6 md:mb-8 sticky top-0 z-10 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md py-3 -mx-6 px-6 md:mx-0 md:px-0 border-b md:border-none border-gray-100 dark:border-gray-800">
        <h1 className="text-xl md:text-2xl font-bold mr-2">Shadowing Market</h1>
        <div className="flex items-center gap-2 md:gap-4 shrink-0">
          <Link href="/mypage" className="text-blue-600 hover:text-blue-700 flex items-center gap-1.5" title="マイページ">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="hidden md:inline text-sm font-medium">マイページ</span>
          </Link>
          {isAdmin && (
            <a href="http://localhost:3000/admin" className="text-orange-500 hover:text-orange-600 flex items-center gap-1.5" title="管理者">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="hidden md:inline text-sm">管理者</span>
            </a>
          )}
          <span className="hidden md:block text-sm opacity-70 border-r border-gray-300 pr-4">{user.email}</span>
          <button
            onClick={signOut}
            className="hidden md:flex text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 items-center gap-1.5"
            title="ログアウト"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span className="text-sm">ログアウト</span>
          </button>
        </div>
      </header>


      {/* Difficulty Filter */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {DIFFICULTY_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setDifficultyFilter(f.value)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition ${difficultyFilter === f.value
                ? "bg-blue-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loadingMaterials ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
        </div>
      ) : materials.length === 0 ? (
        <div
          className="text-center py-12 rounded-lg"
          style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
        >
          <p className="opacity-60">まだ教材がありません</p>
          <p className="text-sm opacity-40 mt-2">
            「教材をリクエスト」から始めましょう
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
          {materials
            .filter((m) => difficultyFilter === "all" || m.difficulty === difficultyFilter)
            .map((material) => (
              <MaterialCard
                key={material.id}
                material={material}
                isFavorite={favoriteIds.has(material.id)}
                onToggleFavorite={toggleFavorite}
                isAdmin={isAdmin}
                onDelete={deleteMaterial}
              />
            ))}
        </div>
      )}
      <Link
        href="/add"
        className="fixed bottom-6 right-6 bg-blue-600 text-white h-14 rounded-full shadow-lg flex items-center overflow-hidden transition-all duration-300 ease-in-out w-14 hover:w-48 group z-50"
        title="教材をリクエスト"
      >
        <div className="flex items-center justify-center w-14 h-14 shrink-0">
          <svg
            className="w-8 h-8"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
        </div>
        <span className="whitespace-nowrap font-bold pr-6 opacity-0 group-hover:opacity-100 transition-opacity duration-300 delay-100">
          教材を追加
        </span>
      </Link>
    </div>
  );
}
