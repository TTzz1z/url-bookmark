# Design QA

## Evidence

- Source visual truth: `E:\url-bookmark\docs\UI-REFERENCE.png`
- Source pixels: 1196 × 1315, containing a 1196 × 686 home screen and a
  1196 × 629 detail screen.
- Browser-rendered implementation:
  - `E:\url-bookmark\demo\screenshots\home.png`
  - `E:\url-bookmark\demo\screenshots\detail.png`
  - `E:\url-bookmark\demo\screenshots\mobile.png`
  - `E:\url-bookmark\demo\screenshots\mobile-nav.png`
  - `E:\url-bookmark\demo\screenshots\mobile-detail.png`
- Normalized desktop captures:
  - `E:\url-bookmark\demo\screenshots\home-normalized.png`
  - `E:\url-bookmark\demo\screenshots\detail-normalized.png`
- Full comparison, reference left and implementation right:
  `E:\url-bookmark\demo\screenshots\design-qa-comparison.png`
- Focused content comparison:
  `E:\url-bookmark\demo\screenshots\design-qa-focused.png`
- CSS viewports: home 1440 × 826, detail 1440 × 758, mobile 390 × 844.
- Device scale factor: 1.
- Density normalization: desktop implementation captures were downsampled with
  Lanczos to the source pixel sizes before comparison. Mobile is a direct
  390 × 844 capture and is evaluated as a responsive extension because the source
  does not include a mobile frame.
- State: one successfully extracted local fixture article with two real tags and
  a saved note. Dynamic copy differs from the reference sample data by design.
- Browser console/page errors: none in the final capture.
- Final independent acceptance recaptured all five implementation screenshots on
  2026-07-30 after the search-highlight, timestamp, tag-expansion and mobile
  touch-target fixes. The earlier normalized reference comparison remains the
  geometry baseline; the fresh screenshots were visually re-inspected at native
  1440px and 390px sizes.

## Full-view comparison

The final desktop implementation preserves the source composition: white fixed
top bar, narrow left navigation, blue add action, title/search/sort hierarchy,
single-column bookmark cards, detail reading canvas and a right information card.
The list/form width was constrained in pass 3 to match the reference content rail,
while the search and sort tools remain aligned to the wider header rail.

The implementation intentionally uses real extracted content instead of reproducing
the reference's sample records. It also uses a neutral domain thumbnail because the
product does not archive screenshots or download remote imagery.

## Focused comparison

The focused comparison covers the interactive header, add form, filters, card
typography/status chips, detail header/actions/tabs, Markdown reading canvas and
metadata card at native normalized size. These areas are legible in the focused
artifact, so additional crops were not required.

## Required fidelity surfaces

- **Fonts and typography:** System UI with PingFang SC/Microsoft YaHei fallbacks
  matches the compact Chinese interface character. Title, label, metadata and
  reading-body scales preserve the source hierarchy; no broken wrapping or
  truncation affects tasks.
- **Spacing and layout:** Pass 2 moved detail navigation into the global top bar
  and aligned actions with the title. Pass 3 constrained the home content rail,
  increased card rhythm and aligned the detail back link with the main content
  start. Desktop and 390px layouts have no clipped persistent controls.
- **Colors and tokens:** Brand blue, blue selection fills, off-white canvas, muted
  borders and green/amber/red/gray semantic states map to centralized tokens in
  `globals.css` and `docs/UI-SPEC.md`. Contrast and focus rings remain clear.
- **Image and asset quality:** UI icons use one Phosphor icon family. No Emoji,
  custom SVG, CSS illustration or fake raster asset is used. The neutral domain
  tile is an intentional functional fallback; remote images are not archived.
- **Copy and content:** Core Chinese labels follow the source vocabulary. Loading,
  empty, no-result, partial and failed states extend that vocabulary without
  introducing another visual system.
- **Responsiveness and accessibility:** At 390px the URL action stacks, filter
  pills scroll horizontally, cards remain readable and the left navigation opens
  as a keyboard-accessible drawer. Focus styles, labels, landmarks, reduced motion
  and minimum action sizes are present.

## Comparison history

### Pass 1 — blocked

- **[P1] Detail hierarchy drift**
  - Evidence: the implementation placed “返回列表” and all actions in a separate
    content row, pushing the title and reading canvas lower than the source.
  - Fix: added the detail back link to the global top bar and grouped title metadata
    with the action buttons in one detail header.

### Pass 2 — blocked

- **[P2] Detail/top-bar alignment and active navigation**
  - Evidence: the back link started beside the logo rather than at the content rail,
    and the detail screen still highlighted “首页”.
  - Fix: aligned the back link to the calculated main content start and added an
    explicit “全部收藏” active navigation state.
- **[P2] Home content rail too wide**
  - Evidence: form and bookmark cards extended farther right than the source.
  - Fix: constrained add/filter/feedback/list surfaces to 1040px and increased card
    vertical rhythm.

### Pass 3 — passed

Post-fix evidence is in `demo/screenshots/design-qa-comparison.png` and
`demo/screenshots/design-qa-focused.png`. No actionable P0, P1 or P2 differences
remain.

## Follow-up polish

- [P3] The source includes two small utility icons in the top bar that are omitted
  because they have no product behavior in the requested scope.
- [P3] Real sites with an extracted cover image could optionally show the remote
  image after an explicit privacy/performance decision; the current neutral tile is
  safer and consistent.

## Final result

final result: passed
