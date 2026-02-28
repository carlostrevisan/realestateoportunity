# DESIGN.MD — RE Opportunity Engine Design System

## 1. Core Philosophy: "Assertive Tactical"
The RE Opportunity Engine is a professional investment tool, not a consumer social app. The design premise is **Assertive Tactical**: high-density data, high-contrast visibility, and a "mission control" aesthetic. It prioritizes utility and speed over decorative elements.

### Key Principles:
- **Zero Friction:** Information should be visible without unnecessary clicks.
- **Living Interface:** Statuses should pulse, logs should stream, and markers should update in real-time.
- **Tactical Hierarchy:** Use typography and color to instantly distinguish between "Good" (High Yield), "Neutral" (Mid/Idle), and "Danger" (Loss/Failed).

---

## 2. Visual Language

### Color Palette
Standardized on a high-contrast light theme. Dark mode is explicitly excluded to maintain a unified tactical look.

| Category | Color Hex | Usage |
| :--- | :--- | :--- |
| **Background** | `#f8fafc` | Main application backdrop. |
| **Surface** | `#ffffff` | Panels, cards, and modals. |
| **Border** | `#e2e8f0` | Defining boundaries between data sections. |
| **Accent** | `#2563eb` | Primary actions, links, and "Execution" status. |
| **Success** | `#059669` | Profitable ROI, completed jobs, "Load" operations. |
| **Warning** | `#d97706` | Marginal ROI, pending states, "Skip" operations. |
| **Danger** | `#e11d48` | Negative ROI, destructive actions, "Fail" operations. |

### Typography
- **Primary (Sans):** `Plus Jakarta Sans`. Modern, clean, and highly readable at small sizes. Used for all labels, headings, and body text.
- **Secondary (Mono):** `JetBrains Mono`. Used for technical data, property IDs, coordinates, and the Telemetry Console logs.

---

## 3. UI Patterns & Components

### The "HUD" (Heads-Up Display)
All data-heavy pages (like Operations) must lead with a HUD.
- **Style:** A grid of boxes with a tiny uppercase label and a large, bold value.
- **Feedback:** Values should be color-coded (Green/Yellow/Red) based on their health or performance.

### Panels & Modals
- **Edges:** 4px to 8px rounded corners (`rounded-md` or `rounded-lg`).
- **Shadows:** Minimal tactical shadows (`shadow-sm`).
- **Headers:** Panels must have a subtle background (`bg-plt-bg/20`), a bottom border, and a status dot or tag.

### Action Buttons (`Btn`)
- **Interaction:** Buttons must have a subtle scale-down effect on click (`active:scale-[0.98]`).
- **Feedback:** Any asynchronous action must show a "Loading..." state for a minimum of 600ms to prevent UI flickering.

### Telemetry & Logs
The `JobConsole` is the standard for long-running tasks.
- Background should be a light off-white (`bg-slate-50`).
- Lines should be prefixed with line numbers (`001`, `002`) at low opacity.
- Keywords like `[EXEC]`, `[LOAD]`, and `[FAIL]` must be color-coded.

---

## 4. Layout & Interaction

### Layout Stability
- **Locked Dimensions:** The main navigation and HUDs are fixed-height. Sidebars or Map containers should use flexbox to fill the remaining space.
- **Independent Scrolling:** Never scroll the whole page. Use `overflow-y-auto` on specific content containers (Logs, Property Details, Sidebar) to keep the controls and navigation always visible.

### Data Selection
- **Job Switchers:** When multiple tasks are present, use "Task Chips" (horizontal buttons with short IDs) rather than deep nesting.
- **Contextual Fallbacks:** If data is missing (e.g., a Sold Date), never show "N/A". Use generic but professional fallbacks like "History" or "Legacy".

---

## 5. Implementation Notes for Future Agents
- **Icons:** Use thin-stroke SVG icons (2.0px stroke-width).
- **Transitions:** Use `transition-all duration-150` for hover states.
- **Spacing:** Stick to a 4-pixel grid (Tailwind `p-1`, `p-4`, `gap-2`, etc.).
- **Map Standard:** Leaflet markers must follow the ROI color scheme (Green/Yellow/Red) with a 0.8 fill opacity. Selected items should have a black border.
