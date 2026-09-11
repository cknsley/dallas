import { useCallback, useState } from "react";

/** Petite préférence d'interface conservée entre les sessions. */
export function usePref<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const storageKey = `atelier-revente:pref:${key}`;
  const [value, setValue] = useState<T>(() => (localStorage.getItem(storageKey) as T) || initial);
  const set = useCallback(
    (v: T) => {
      setValue(v);
      localStorage.setItem(storageKey, v);
    },
    [storageKey],
  );
  return [value, set];
}
