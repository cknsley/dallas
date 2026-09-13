import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useStore } from "../store/StoreContext";
import { filterItemsByDomain, type Domain } from "./calc";
import type { Item } from "../types";

export interface SecteurScope {
  domain: Domain;
  /** Les articles du secteur courant — tous tant qu'aucun secteur n'est choisi. */
  items: Item[];
  /** Cet article appartient-il au secteur courant ? */
  matches: (i: Item) => boolean;
  /**
   * Une entité rattachée à des articles (facture, retour, tâche…) appartient au secteur
   * dès qu'un de ses articles en fait partie. Sans lien exploitable elle reste visible
   * partout : une donnée transverse vaut mieux qu'une donnée qui disparaît.
   */
  matchesLinked: (ids: (string | undefined | null)[]) => boolean;
}

/** Secteur porté par l'URL (`?secteur=tcg|fashion`), posé par la frontpage et sa nav. */
export function useSecteur(): SecteurScope {
  const { state } = useStore();
  const [searchParams] = useSearchParams();
  const raw = searchParams.get("secteur");
  const customIds = (state.settings.customSectors ?? []).map((s) => s.id);
  const domain: Domain = raw === "tcg" || raw === "fashion" || (raw && customIds.includes(raw)) ? raw : "all";

  return useMemo(() => {
    const items = filterItemsByDomain(state.items, domain);
    const inScope = new Set(items.map((i) => i.id));
    const known = new Set(state.items.map((i) => i.id));

    const matches = (i: Item) => domain === "all" || inScope.has(i.id);

    const matchesLinked = (ids: (string | undefined | null)[]) => {
      if (domain === "all") return true;
      const linked = ids.filter((id): id is string => typeof id === "string" && known.has(id));
      return linked.length === 0 || linked.some((id) => inScope.has(id));
    };

    return { domain, items, matches, matchesLinked };
  }, [state.items, domain]);
}
