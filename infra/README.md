# Infra

Local and deployment infrastructure assets live here.

- `docker/`: Dockerfiles and container build assets.
- `compose/`: local multi-service orchestration.

No current website/runtime paths depend on this folder.

## TOEFL responsive sizing checks

Run the focused browser regression from the repository root:

```powershell
npx playwright test --config infra/playwright.config.cjs --project desktop --grep "TOEFL sizing stays consistent"
```

The check covers 390, 768, 820, 1023, 1024, 1440 and 1920px viewports.
The [shared baseline](../toefl-sample/toefl-base.css) caps content at 1232px,
with 24px desktop, 16px tablet and 12px phone gutters. Below 1024px,
navigation uses the compact dock/drawer and Marketplace filters move into
the content. Explore remains sidebar-free and uses the same content cap
and gutters without reserving empty sidebar space. Catalog columns respond
to available space, keeping cards at least 260px wide when space permits.
Marketplace and Progress text have a 12px minimum; icon-only controls and
the shared compact navigation retain their separate sizing.