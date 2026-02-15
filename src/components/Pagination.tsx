"use client";

type PaginationProps = {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
};

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  isLoading,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const canGoPrev = currentPage > 0 && !isLoading;
  const canGoNext = currentPage < totalPages - 1 && !isLoading;

  return (
    <div className="flex items-center justify-center gap-4 mt-6 py-4">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={!canGoPrev}
        className="px-4 py-2 text-sm font-medium rounded-lg transition disabled:opacity-40"
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
        }}
      >
        前へ
      </button>
      <span className="text-sm text-gray-600 dark:text-gray-400">
        {currentPage + 1} / {totalPages}
      </span>
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={!canGoNext}
        className="px-4 py-2 text-sm font-medium rounded-lg transition disabled:opacity-40"
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
        }}
      >
        次へ
      </button>
    </div>
  );
}
