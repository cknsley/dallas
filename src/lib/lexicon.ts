/**
 * Vocabulaire unique de l'app : un concept = un mot, partout.
 * Toute étiquette d'argent passe par ici pour éviter les synonymes qui
 * se multiplient d'un écran à l'autre (« coût d'entrée », « port entrant »…).
 */
export const LABEL = {
  /** Ce que l’article a coûté à l'achat. */
  cost: "Prix d'achat",
  /** Tout ce qui s'ajoute à l'achat : livraison reçue, nettoyage, retouche. */
  fees: "Frais d'achat",
  /** Prix d'achat + frais d'achat. */
  totalCost: "Coût total",
  /** Prix auquel l’article est parti. */
  price: "Prix de vente",
  /** Prix espéré tant que l’article n’est pas vendu. */
  estimate: "Estimation de revente",
  /** Ce que la plateforme prélève sur la vente. */
  saleFees: "Commission",
  /** Port refacturé à l'acheteur — il rentre. */
  shippingPaid: "Port encaissé",
  /** Port que je règle moi-même — il sort. */
  shippingCost: "Port à ma charge",
  /** Commission + port à ma charge. */
  saleCosts: "Frais de vente",
} as const;

/** Précisions affichées sous les champs, elles aussi uniques. */
export const HINT = {
  fees: "Livraison reçue, nettoyage, retouche",
  estimate: "À combien vous pensez la revendre",
} as const;

/** Étiquette avec l'unité, pour les champs de formulaire. */
export const eurLabel = (label: string) => `${label} (€)`;
