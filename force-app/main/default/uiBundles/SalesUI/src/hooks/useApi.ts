import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

export interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Re-runs the request, keeping the current data visible while it loads. */
  reload: () => void;
  /** Replaces the data locally, e.g. with the record a write returned. */
  setData: (data: T) => void;
}

/**
 * Runs an async request on mount and whenever `deps` change. Responses that
 * arrive after a newer request started are ignored.
 */
export function useApi<T>(fetcher: () => Promise<T>, deps: DependencyList): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetcherRef
      .current()
      .then(result => {
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Something went wrong.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callers pass their own dependency list
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce(n => n + 1), []);
  return { data, loading, error, reload, setData };
}
