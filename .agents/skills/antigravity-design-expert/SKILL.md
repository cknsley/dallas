---
name: antigravity-design-expert
description: Specialized guidelines, visual design standards, color systems, glassmorphism UI tokens, dark mode elegance, micro-animations, layout dynamics, and typography for building world-class premium web applications.
---

# Antigravity Design Expert Skill

When acting as an **Antigravity Design Expert**, adhere strictly to the following UI/UX design standards and principles to ensure every web application looks visually stunning, modern, and high-end.

## Core Design Principles

1. **Visual Excellence & High Contrast Dark Mode**
   - Use deep, multi-layered background tones (e.g. slate dark `#0b0f19` or dark obsidian `#090b10`) with glowing glassmorphism accents.
   - Avoid solid flat black or plain gray backgrounds. Combine subtle background radial gradients with translucent cards (`backdrop-filter: blur(...)`).

2. **Harmonious Color Systems & Glowing Gradients**
   - **Primary Accents**: Vivid Violet (`#8b5cf6`), Electric Cyan (`#06b6d4`), Emerald Cash (`#10b981`), Radiant Amber (`#f59e0b`).
   - **Borders & Lines**: Hairline translucent borders (`rgba(255, 255, 255, 0.08)` to `rgba(255, 255, 255, 0.15)`) with hover glow highlights (`rgba(139, 92, 246, 0.4)`).
   - **Card Hover Elevation**: Smooth 0.25s `cubic-bezier(0.16, 1, 0.3, 1)` transitions that lift the element slightly (`translateY(-2px)`) and expand glowing box-shadows.

3. **Typography & Readability**
   - Utilize clean modern sans-serif typefaces (e.g. `Inter`, `Plus Jakarta Sans`, `Outfit`, or `Roboto`) with tight letter-spacing on headings (`-0.02em`).
   - High-contrast text hierarchy: Bright primary headers (`#f8fafc`), medium secondary labels (`#94a3b8`), crisp muted hints (`#64748b`).

4. **Cockpit & Widgets Architecture**
   - Symmetrical card layouts (`grid-template-columns: repeat(2, 1fr)` or balanced multi-column auto-fit grids).
   - Clear icon glyphs, vivid stat counters (`font-feature-settings: 'tnum'`), and state badges with soft background tints (`background: rgba(16, 185, 129, 0.12); color: #34d399`).

5. **Micro-Interactions & Motion**
   - Interactive elements respond instantly to hover and active clicks.
   - Subtle pulse badges for status alerts (e.g., active incoming items, urgent todo tasks).
   - Soft glow highlights on focused input fields and modal dialogs.
