import { useState } from "react";

/** Champ modifiable directement dans une ligne de tableau, sans ouvrir de fiche. */
export default function InlineField({
  value, placeholder, type = "text", onCommit, width = 140,
}: {
  value: string;
  placeholder: string;
  type?: "text" | "date";
  onCommit: (v: string) => void;
  width?: number;
}) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  // Tant que le champ n'a pas le focus, il suit la valeur du store.
  if (!focused && draft !== value) setDraft(value);

  return (
    <input
      type={type}
      value={draft}
      placeholder={placeholder}
      style={{ width, padding: "4px 7px", fontSize: 12 }}
      onFocus={() => setFocused(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { setFocused(false); if (draft !== value) onCommit(draft); }}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
    />
  );
}
