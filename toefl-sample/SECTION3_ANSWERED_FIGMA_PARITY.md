the # Section 3 Answered - Figma Parity Notes

Target:
- Figma node: `1198:1916` (QuickCheck / reading explaination)
- File implemented: `toefl-sample/section 3-answered.html`

## What was aligned

1. Canvas and panel geometry
- Two-column canvas aligned to Figma proportions (`707px` left, `731px` right).
- Left reading card width aligned (`701px`) and review panel baseline height aligned (`836px`).
- Right question/explanation card width aligned (`689px`).

2. Header navigator behavior
- Navigator chips now render in explicit rows instead of one long vertical stream.
- Row grouping:
  - Part A: 5 chips per row
  - Part B: 4 chips per row
  - Part C: 6 chips per row

3. Passage and explanation typography
- Passage body switched to Arial 18/1.42 for visual parity.
- Explanation body switched to Inter 12/1.35 and compact heading style.

4. Option states and status signals
- User-selected option uses Figma-like teal fill/border/shadow treatment.
- Question number badge color is now status-aware via `--q-accent`:
  - Correct: teal
  - Incorrect: red
  - Unanswered: gray

5. Evidence highlighting
- Highlight pipeline injects `<mark class="passage-highlight">...</mark>` based on quote extraction and phrase hints.
- Highlight style uses yellow emphasis with underline to mirror the design intent.

## Automated checks

A lightweight parity guard exists at:
- `toefl-sample/tests/section3-answered-figma-parity.test.js`

Run:

```bash
node toefl-sample/tests/section3-answered-figma-parity.test.js
```

The test checks that critical Figma parity markers (dimensions, typography, rendering hooks, and highlight pipeline) remain intact.
