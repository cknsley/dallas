import { useEffect } from "react";

export default function SectionToggles() {
  useEffect(() => {
    const enhance = () => {
      document.querySelectorAll<HTMLElement>(".view .card").forEach((card) => {
        const header = card.querySelector<HTMLElement>(":scope > .card-h");
        if (!header || header.querySelector(".section-toggle")) return;

        const button = document.createElement("button");
        button.type = "button";
        button.className = "section-toggle";
        button.setAttribute("aria-label", "Replier la section");
        button.innerHTML = "<span class=\"section-toggle-bars\">≡</span><span class=\"section-toggle-chevron\">⌃</span>";
        button.addEventListener("click", () => {
          const collapsed = card.classList.toggle("section-collapsed");
          button.setAttribute("aria-label", collapsed ? "Déplier la section" : "Replier la section");
        });

        header.prepend(button);
      });
    };

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
