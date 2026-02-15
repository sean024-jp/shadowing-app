"use client";

import Link from "next/link";

type MaterialCardProps = {
    material: {
        id: string;
        title: string;
        youtube_id: string;
        start_time: number;
        end_time: number;
        wpm: number | null;
        description: string | null;
        favorite_count: number;
        created_at: string;
    };
    isFavorite: boolean;
    onToggleFavorite: (id: string) => void;
    isAdmin?: boolean;
    onDelete?: (id: string) => void;
};

export function MaterialCard({
    material,
    isFavorite,
    onToggleFavorite,
    isAdmin,
    onDelete,
}: MaterialCardProps) {
    return (
        <div
            className="flex flex-col rounded-lg overflow-hidden transition hover:shadow-lg dark:hover:bg-gray-800 h-full"
            style={{
                background: "var(--card-bg)",
                border: "1px solid var(--card-border)"
            }}
        >
            {/* Thumbnail Area - Full Width */}
            <div className="relative aspect-video w-full bg-gray-100 dark:bg-gray-800">
                <img
                    src={`https://img.youtube.com/vi/${material.youtube_id}/mqdefault.jpg`}
                    alt={material.title}
                    className="w-full h-full object-cover"
                />
                {Date.now() - new Date(material.created_at).getTime() < 7 * 24 * 60 * 60 * 1000 && (
                    <div className="absolute top-1.5 left-1.5 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow">
                        NEW
                    </div>
                )}
                <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1 rounded">
                    {Math.floor((material.end_time - material.start_time))}s
                </div>
            </div>

            {/* Content Area */}
            <div className="flex flex-col flex-1 p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                    <Link href={`/practice/${material.id}`} className="font-bold text-gray-800 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 line-clamp-2 leading-tight flex-1">
                        {material.title}
                    </Link>
                </div>

                {material.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-2 leading-relaxed">
                        {material.description}
                    </p>
                )}

                <div className="flex items-center gap-2 mb-3">
                    {material.wpm && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                            {material.wpm} WPM
                        </span>
                    )}
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(material.created_at).toLocaleDateString("ja-JP")}
                    </span>
                </div>

                {/* Footer Actions */}
                <div className="mt-auto flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            onToggleFavorite(material.id);
                        }}
                        className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:opacity-80 transition"
                        title={isFavorite ? "お気に入り解除" : "お気に入り追加"}
                    >
                        <svg
                            className="w-4 h-4"
                            fill={isFavorite ? "#eab308" : "none"}
                            stroke={isFavorite ? "#eab308" : "currentColor"}
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                            />
                        </svg>
                        <span>{material.favorite_count}</span>
                    </button>

                    <div className="flex gap-2">
                        {isAdmin && onDelete && (
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    onDelete(material.id);
                                }}
                                className="text-red-500 hover:text-red-700 text-xs"
                            >
                                削除
                            </button>
                        )}
                        <Link
                            href={`/practice/${material.id}`}
                            className="bg-blue-600 text-white text-xs font-bold px-3 py-1.5 rounded-full hover:bg-blue-700 transition"
                        >
                            練習
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
