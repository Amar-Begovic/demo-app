"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface ArticleSelectionContextType {
  selectedIds: Set<string>;
  toggle: (id: string) => void;
  toggleAll: (ids: string[]) => void;
  clear: () => void;
  isSelected: (id: string) => boolean;
  allSelected: (ids: string[]) => boolean;
  count: number;
}

const ArticleSelectionContext = createContext<ArticleSelectionContextType | null>(null);

export function ArticleSelectionProvider({ children }: { children: ReactNode }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback((ids: string[]) => {
    setSelectedIds((prev) => {
      const allSelected = ids.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelectedIds(new Set()), []);

  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);

  const allSelected = useCallback(
    (ids: string[]) => ids.length > 0 && ids.every((id) => selectedIds.has(id)),
    [selectedIds]
  );

  return (
    <ArticleSelectionContext.Provider
      value={{ selectedIds, toggle, toggleAll, clear, isSelected, allSelected, count: selectedIds.size }}
    >
      {children}
    </ArticleSelectionContext.Provider>
  );
}

export function useArticleSelection() {
  const ctx = useContext(ArticleSelectionContext);
  if (!ctx) throw new Error("useArticleSelection must be used within ArticleSelectionProvider");
  return ctx;
}
