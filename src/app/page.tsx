"use client";

import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";
import Link from "next/link";

type Material = {
  id: string;
  title: string;
  youtube_id: string;
  created_at: string;
};

export default function Home() {
  const { user, loading, signInWithGoogle, signOut } = useAuth();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);

  useEffect(() => {
    if (user) {
      loadMaterials();
    }
  }, [user]);

  const loadMaterials = async () => {
    setLoadingMaterials(true);
    const { data } = await supabase
      .from("materials")
      .select("*")
      .order("created_at", { ascending: false });
    setMaterials(data || []);
    setLoadingMaterials(false);
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
        <h1 className="text-3xl font-bold">Shadowing App</h1>
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
    <div className="max-w-4xl mx-auto p-6">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Shadowing App</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm opacity-70">{user.email}</span>
          <button
            onClick={signOut}
            className="text-sm opacity-60 hover:opacity-100"
          >
            ログアウト
          </button>
        </div>
      </header>

      <Link
        href="/add"
        className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition mb-8"
      >
        <svg
          className="w-5 h-5"
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
        教材をリクエスト
      </Link>

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
            「新しい教材を追加」から始めましょう
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {materials.map((material) => (
            <div
              key={material.id}
              className="rounded-lg p-4 flex items-center gap-4"
              style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
            >
              <img
                src={`https://img.youtube.com/vi/${material.youtube_id}/mqdefault.jpg`}
                alt={material.title}
                className="w-32 h-20 object-cover rounded"
              />
              <div className="flex-1">
                <h3 className="font-medium">{material.title}</h3>
                <p className="text-sm opacity-60">
                  {new Date(material.created_at).toLocaleDateString("ja-JP")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/practice/${material.id}`}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition text-sm"
                >
                  練習する
                </Link>
                <button
                  onClick={() => deleteMaterial(material.id)}
                  className="text-red-500 hover:text-red-400 p-2"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
