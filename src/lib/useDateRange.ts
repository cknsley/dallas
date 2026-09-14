import { useMemo } from "react";
import { usePref } from "./usePref";
import { dshort } from "./format";
import type { Range } from "./calc";

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Plage de dates d'une page, mémorisée entre les visites. Tant que l'utilisateur
 * n'a rien choisi, on retombe sur le mois en cours plutôt que d'écrire une date
 * en dur dans les préférences.
 */
export function useDateRange(key: string): {
  range: Range;
  from: string;
  to: string;
  setRange: (r: { from: string; to: string }) => void;
} {
  const [rawFrom, setFrom] = usePref<string>(`${key}From`, "");
  const [rawTo, setTo] = usePref<string>(`${key}To`, "");

  const thisMonth = useMemo(() => {
    const n = new Date();
    return {
      from: iso(new Date(n.getFullYear(), n.getMonth(), 1)),
      to: iso(new Date(n.getFullYear(), n.getMonth() + 1, 0)),
    };
  }, []);

  const from = rawFrom || thisMonth.from;
  const to = rawTo || thisMonth.to;

  const range = useMemo<Range>(
    () => ({ from, to, label: `du ${dshort(from)} au ${dshort(to)}`, bounded: true }),
    [from, to],
  );

  return {
    range,
    from,
    to,
    setRange: (r) => { setFrom(r.from); setTo(r.to); },
  };
}
