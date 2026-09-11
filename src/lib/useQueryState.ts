import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Filtre porté par l'URL : chaque écran devient adressable, donc n'importe quelle
 * autre section peut y renvoyer déjà filtré (« 3 colis à expédier » → la bonne liste).
 */
export function useQueryState(key: string, fallback = ""): [string, (v: string) => void] {
  const [params, setParams] = useSearchParams();
  const value = params.get(key) ?? fallback;

  const set = useCallback(
    (next: string) => {
      setParams(
        (prev) => {
          const copy = new URLSearchParams(prev);
          if (!next || next === fallback) copy.delete(key);
          else copy.set(key, next);
          return copy;
        },
        { replace: true },
      );
    },
    [key, fallback, setParams],
  );

  return [value, set];
}

/** Efface d'un coup plusieurs filtres de l'URL. */
export function useClearQuery(keys: string[]): () => void {
  const [, setParams] = useSearchParams();
  return useCallback(() => {
    setParams(
      (prev) => {
        const copy = new URLSearchParams(prev);
        keys.forEach((k) => copy.delete(k));
        return copy;
      },
      { replace: true },
    );
  }, [keys, setParams]);
}
