# TOEFL Navigation Contract

Apply this navigation behavior to every TOEFL page.

## Icons

- Dashboard: Lucide `house`
- Today: Tabler-style calendar with the live day number
- Mock Test: Tabler `books`
- Practice Test: Tabler `book`
- My Progress: Tabler `chart-bar`
- Developer: Phosphor `user-circle-gear`
- Back to IELTS: Tabler `arrow-back-up`
- Settings: Tabler `settings`
- Notifications: Lucide `bell-dot`
- Expanded sidebar control: Tabler `layout-sidebar-left-collapse`
- Collapsed sidebar control: Tabler `layout-sidebar-left-expand`

Local Tabler and Phosphor SVGs live in `../asset/figma/`.

## Expanded Sidebar

- Width: 250px
- Surface: `#eaf5ff` or `#eff7ff`
- Navigation items: 8px radius
- Active item: white background with `0 2px 4px rgba(0, 0, 0, 0.05)` shadow

## Collapsed Sidebar

- Width: 80px
- Navigation target: 40px by 40px
- Icon leaf: 20px by 20px, except the numbered calendar at 13.3px by 15px
- Hide labels and search input
- Display the expand control above the logo on logo hover or focus
- Display a black pill tooltip to the right of the hovered item:
  - 40px height
  - 20px radius
  - Inter SemiBold, 15px
  - white text

## Behavior

- Today label and calendar number must derive from `new Date()`.
- The active page sets its own active navigation item.
- Collapse must preserve desktop content width and fall back to the readable full-width navigation at tablet/mobile breakpoints.
- Tooltips must render above page cards: the collapsed sidebar requires visible overflow and a higher stacking level than page content.
