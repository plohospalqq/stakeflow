import { useEffect, useState } from 'react';

/** The value, settled: updates only after it stopped changing for `ms` (slider drags). */
export function useDebounced<T>(value: T, ms = 150): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return settled;
}
