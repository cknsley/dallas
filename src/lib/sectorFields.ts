import type { Item } from "../types";
import { isTcgItem } from "./calc";

/**
 * Les pages secteur sont communes à tous les univers : seuls les champs changent de sens.
 * En Vêtements on parle marque / type / taille / état, en TCG licence / set / grade / format.
 * Les données restent dans les mêmes champs (brand, size…) complétés des champs tcg*.
 */

export type TcgCategory = NonNullable<Item["tcgCategory"]>;

export const TCG_CATEGORIES: { key: TcgCategory; label: string; icon: string }[] = [
  { key: "raw", label: "Cartes", icon: "🃏" },
  { key: "graded", label: "Gradées", icon: "🏆" },
  { key: "grading", label: "En gradation", icon: "⏳" },
  { key: "blister", label: "Blisters", icon: "🟡" },
  { key: "sealed", label: "Displays", icon: "📦" },
  { key: "case", label: "Cases", icon: "🧱" },
];

export const TCG_GAMES = ["Pokémon", "One Piece", "Yu-Gi-Oh!", "Magic", "Lorcana", "Dragon Ball"];

export const TCG_GRADES = [
  "Raw (Near Mint)", "Raw (Excellent)", "PSA 10 Gem Mint", "PSA 9 Mint", "PSA 8 Near Mint",
  "BGS 10 Pristine", "BGS 9.5 Gem Mint", "PCA 10 Gem Mint", "PCA 9.5", "CGC 10",
];

/** Format d'un article TCG : le champ explicite d'abord, sinon déduit du grade et du libellé. */
export function getTcgCategory(i: Item): TcgCategory {
  if (i.tcgCategory) return i.tcgCategory;
  const grade = (i.tcgGrade || i.size || "").toLowerCase();
  const text = `${i.name || ""} ${i.type || ""}`.toLowerCase();
  if (grade.includes("gradation")) return "grading";
  if (/\b(psa|bgs|pca|cgc|sgs)\b/.test(grade)) return "graded";
  if (text.includes("case")) return "case";
  if (text.includes("blister") || text.includes("artset")) return "blister";
  if (/(display|etb|booster|coffret|scell)/.test(text)) return "sealed";
  return "raw";
}

export const tcgCategoryLabel = (i: Item): string =>
  TCG_CATEGORIES.find((c) => c.key === getTcgCategory(i))?.label ?? "Cartes";

export type AttrKey = "brand" | "type" | "size" | "condition";

/** Valeur d'un attribut selon l'univers de l'article lui-même (utile dans les vues mixtes). */
export function itemAttr(i: Item, k: AttrKey): string {
  if (isTcgItem(i)) {
    if (k === "brand") return i.tcgGame || i.brand || "";
    if (k === "type") return i.tcgSet || "";
    if (k === "size") return i.tcgGrade || i.size || "";
    return tcgCategoryLabel(i);
  }
  return (k === "condition" ? i.condition : i[k]) || "";
}

/** Taille courte pour les lignes compactes : « T.42 » en vêtements, le grade tel quel en TCG. */
export const sizeTag = (i: Item): string => {
  const size = itemAttr(i, "size");
  if (!size) return "";
  return isTcgItem(i) ? size : `T.${size}`;
};

export interface FieldLabels {
  brand: string; brandPlaceholder: string; brandAll: string;
  type: string; typePlaceholder: string; typeAll: string;
  size: string; sizePlaceholder: string; sizeAll: string; sizePrefix: string;
  condition: string;
  name: string; namePlaceholder: string;
}

const FASHION_LABELS: FieldLabels = {
  brand: "Marque", brandPlaceholder: "ex. Nike, Adidas, Supreme…", brandAll: "Toutes marques",
  type: "Type", typePlaceholder: "Sneakers, Vêtements…", typeAll: "Tous types",
  size: "Taille", sizePlaceholder: "ex. 42, M, US 9…", sizeAll: "Toutes tailles", sizePrefix: "T. ",
  condition: "État",
  name: "Modèle / nom produit", namePlaceholder: "ex. Dunk Low Panda",
};

const TCG_LABELS: FieldLabels = {
  brand: "Licence", brandPlaceholder: "ex. Pokémon, One Piece, Lorcana…", brandAll: "Toutes licences",
  type: "Set / Extension", typePlaceholder: "ex. 151, Évolution Céleste, OP-05…", typeAll: "Tous sets",
  size: "Grade", sizePlaceholder: "ex. PSA 10, Raw Near Mint…", sizeAll: "Tous grades", sizePrefix: "",
  condition: "Format",
  name: "Carte / produit", namePlaceholder: "ex. Dracaufeu ex 199/165, Display 151",
};

export const fieldLabels = (domain: string): FieldLabels => (domain === "tcg" ? TCG_LABELS : FASHION_LABELS);

/**
 * Ce qu'un article créé depuis un univers doit porter pour y rester : sans ça, un article
 * ajouté depuis l'espace TCG retomberait dans Vêtements et disparaîtrait de la page.
 */
export function sectorStamp(domain: string, i: { brand?: string; size?: string; set?: string } = {}): Partial<Item> {
  if (domain === "tcg") {
    return { isTcg: true, tcgGame: i.brand || undefined, tcgGrade: i.size || undefined, tcgSet: i.set || undefined };
  }
  if (domain !== "all" && domain !== "fashion") return { sector: domain };
  return {};
}
