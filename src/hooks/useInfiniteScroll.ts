"use client";

import { useState, useRef, useCallback, useEffect } from "react";

type FetchPageFn<T> = (
  page: number,
  pageSize: number
) => Promise<{ data: T[]; hasMore: boolean }>;

type UseInfiniteScrollOptions = {
  pageSize: number;
  enabled?: boolean;
};

export function useInfiniteScroll<T>(
  fetchPage: FetchPageFn<T>,
  options: UseInfiniteScrollOptions
) {
  const { pageSize, enabled = true } = options;

  const [items, setItems] = useState<T[]>([]);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  const initializedRef = useRef(false);
  const resetCounterRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const isFirstPage = page === 0;
    if (isFirstPage) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }

    const capturedCounter = resetCounterRef.current;

    fetchRef.current(page, pageSize).then((result) => {
      if (capturedCounter !== resetCounterRef.current) return;

      if (isFirstPage) {
        setItems(result.data);
      } else {
        setItems((prev) => [...prev, ...result.data]);
      }
      setHasMore(result.hasMore);
      setIsLoading(false);
      setIsLoadingMore(false);
    });
  }, [page, enabled, pageSize]);

  useEffect(() => {
    if (enabled && !initializedRef.current) {
      initializedRef.current = true;
    }
  }, [enabled]);

  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }

      if (!node || !hasMore) return;

      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && !isLoadingMore && !isLoading) {
            setPage((prev) => prev + 1);
          }
        },
        { rootMargin: "200px" }
      );

      observerRef.current.observe(node);
    },
    [hasMore, isLoadingMore, isLoading]
  );

  const reset = useCallback(() => {
    resetCounterRef.current += 1;
    setItems([]);
    setHasMore(true);
    setPage((prev) => (prev === 0 ? -1 : 0));
  }, []);

  // Handle the -1 trick: immediately go back to 0 to trigger fetch
  useEffect(() => {
    if (page === -1) {
      setPage(0);
    }
  }, [page]);

  return {
    items,
    setItems,
    isLoading,
    isLoadingMore,
    hasMore,
    sentinelRef,
    reset,
  };
}
