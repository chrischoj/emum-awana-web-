import { useState, useCallback, useRef, useEffect } from 'react';

export interface SearchResult {
  pageNum: number;
  /** 해당 페이지 내 매치 횟수 */
  count: number;
}

export function useTextSearch(pdfDoc: any, numPages: number) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<SearchResult[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const pageTextsRef = useRef<Map<number, string>>(new Map());
  const extractedRef = useRef(false);

  // pdfDoc 변경 시 캐시 초기화
  useEffect(() => {
    pageTextsRef.current.clear();
    extractedRef.current = false;
  }, [pdfDoc]);

  const extractAllText = useCallback(async () => {
    if (!pdfDoc || extractedRef.current) return;
    for (let i = 1; i <= numPages; i++) {
      if (pageTextsRef.current.has(i)) continue;
      try {
        const page = await pdfDoc.getPage(i);
        const content = await page.getTextContent();
        const text = content.items.map((item: any) => item.str).join(' ');
        pageTextsRef.current.set(i, text);
      } catch {
        // 개별 페이지 실패 무시
      }
    }
    extractedRef.current = true;
  }, [pdfDoc, numPages]);

  // 쿼리 변경 시 검색
  useEffect(() => {
    if (!query.trim()) {
      setMatches([]);
      setCurrentIndex(0);
      setTotalCount(0);
      return;
    }

    let cancelled = false;
    const search = async () => {
      await extractAllText();
      if (cancelled) return;

      const q = query.toLowerCase();
      const results: SearchResult[] = [];
      let total = 0;

      for (let i = 1; i <= numPages; i++) {
        const text = (pageTextsRef.current.get(i) ?? '').toLowerCase();
        let count = 0;
        let pos = 0;
        while ((pos = text.indexOf(q, pos)) !== -1) {
          count++;
          pos += q.length;
        }
        if (count > 0) {
          results.push({ pageNum: i, count });
          total += count;
        }
      }

      if (!cancelled) {
        setMatches(results);
        setTotalCount(total);
        setCurrentIndex(results.length > 0 ? 0 : -1);
      }
    };

    const timer = setTimeout(search, 300); // 디바운스
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, extractAllText, numPages]);

  const nextMatch = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentIndex((prev) => (prev + 1) % matches.length);
  }, [matches.length]);

  const prevMatch = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentIndex((prev) => (prev - 1 + matches.length) % matches.length);
  }, [matches.length]);

  const toggleSearch = useCallback(() => {
    setIsSearchOpen((prev) => {
      if (prev) {
        setQuery('');
        setMatches([]);
        setCurrentIndex(0);
        setTotalCount(0);
      }
      return !prev;
    });
  }, []);

  return {
    isSearchOpen,
    toggleSearch,
    query,
    setQuery,
    matches,
    currentIndex,
    currentMatch: matches[currentIndex] ?? null,
    nextMatch,
    prevMatch,
    totalCount,
  };
}
