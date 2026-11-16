# Brand Engine — product spec and build plan

Working name: **Brand Engine** (rename later). A new, separate product built as a fork of
Postiz. The live TaxiDex Postiz at `social.taxidex.com` is **not touched**; this is a new
deployment with its own database, domain and Docker image.

Source: fork of `gitroomhq/postiz-app` at **v2.25.3** (commit 5a131eb0, 2026-11-06), cloned to
`D:\postiz-engine`. Upstream layout is kept so upstream fixes can still be merged.

---

## 1. What the product does

A business gives us its website (or fills a short brand form). From then on the product:

1. Builds a **Brand DNA**: name, niche, target topics, SEO keywords, tone, colours, font, logo, CTA.
2. Every week (or on demand) **generates a batch of posts** for the connected channels:
   hook + copy from the LLM, matched to a keyword/topic, with a **branded image** (stock photo +
   hook text + brand colours/logo, rendered on the server) or a **branded short video**
   (stock clip + captions, rendered with FFmpeg).
3. Puts them in a **review queue**. The user approves, edits, or regenerates. Approved posts are
   scheduled into free calendar slots. Optional "auto-approve" makes it fully autonomous.
4. Publishes through the normal Postiz channel integrations (Facebook, Instagram, LinkedIn, X,
   TikTok, YouTube, Pinterest, Threads, Reddit, etc.).

Zero per-post third-party cost except LLM tokens: Pexels (free), server-side canvas and FFmpeg,
Playwright for scraping, Temporal for scheduling (already in Postiz).

---

## 2. What Postiz v2.25.3 already gives us (reuse, do not rebuild)

| Capability | Where in the repo | Notes |
| --- | --- | --- |
| Multi-org, teams, auth, channels (28+ providers) | `apps/backend`, `libraries/nestjs-libraries/src/integrations` | core |
| Calendar, drafts, scheduling, free-slot finder | `posts.service.ts` (`createPost`, `findFreeDateTime`) | we schedule through this |
| AI post generator pipeline (research → topic → hook → content → AI picture → free slot) | `libraries/nestjs-libraries/src/agent/agent.graph.service.ts` | LangGraph; uses `gpt-4.1` and OpenAI image gen; endpoint in `posts.controller.ts` |
| Website/RSS → auto post with picture, on a cron | `database/prisma/autopost/autopost.service.ts` | closest existing thing to "autopilot" |
| OpenAI helpers: generate posts, extract website text, image, slides-from-text, voice | `openai/openai.service.ts` | hard-coded `gpt-4.1` / `chatgpt-image-latest` |
| Slides-to-video (AI images + voice), Seedance, HeyGen | `videos/` | paid generators (fal.ai) — our FFmpeg renderer is the free alternative |
| Media library, local/R2 storage | `database/prisma/media`, `upload/` | we drop rendered files in here |
| Sets, Signatures, Agents (Mastra), MCP, public API, webhooks | various | keep |
| Billing (Stripe) | off when `IS_GENERAL=true` | we run self-hosted mode |
| `canvas` and `sharp` dependencies | root `package.json` | already installed |
| Frontend: Vite + React + Tailwind 3 | `apps/frontend` | NOT Next.js (blueprint is outdated here) |
| Background jobs: Temporal | `apps/orchestrator` | NOT BullMQ (blueprint is outdated here) |

Corrections to the blueprint document:
- Prisma schema lives at `libraries/nestjs-libraries/src/database/prisma/schema.prisma`, not `packages/prisma`.
- Posts are created with `createPost(orgId, CreatePostDto, creationMethod)` where the DTO is
  `{ type, date, shortLink, posts: [{ integration: {id}, value: [{content, image: MediaDto[]}], settings }] }`.
  Brand data must hang off **Organization**, not User (Postiz is org-scoped).
- `DISALLOW_PLUS` does not exist. Self-hosted mode is `IS_GENERAL=true`.
- Required toolchain: Node 22.23.4, pnpm 10.6.1, Postgres 17, Redis 7, Temporal 1.28.

---

## 3. New features (the delta we build)

### F1. Brand DNA
- New Prisma model `BrandProfile` (1:1 with `Organization`): businessName, websiteUrl, niche,
  targetTopics[], keywords[] (with intent), tone, primaryColor, accentColor, fontFamily,
  logoMediaId, ctaUrl, defaultHashtags[], language, country.
- **Auto-fill from website**: Playwright loads the site → collects title/meta/og tags, logo
  candidates, computed colours (most-used background/accent), font families, page text →
  LLM turns that into niche, topics, keywords, tone. User reviews and saves.
- UI: new page `/brand` (settings-style form with live preview card).

### F2. SEO keyword plan
- Keywords stored on the brand with status/intent; every generated post is tagged with the
  keyword/topic it targets; a rotation ensures coverage over a month; shown as a simple
  "coverage" view on `/brand`.

### F3. Stock media source
- `StockMediaService` with providers `pexels` (primary) and `unsplash` (optional; needs their
  production approval). LLM produces the search query; we pick by orientation and
  resolution, cache results per query, store attribution on the Media row.

### F4. Branded image renderer (server-side, `canvas`)
- Templates: hook-on-photo, quote card, stat card, 3-slide carousel, plain brand card
  (no photo). Uses brand colours, font, logo, CTA.
- Output sizes per channel: 1080x1350 (IG/FB feed), 1080x1080, 1200x628 (LinkedIn/X),
  1080x1920 (story/short). Saved to the media library.
- Fonts: bundled open fonts (Inter, etc.) + the brand font if downloadable.

### F5. Branded video renderer (server-side, FFmpeg)
- Stock clip (Pexels video) → trim to 8–15 s → colour grade → captioned hook (drawtext with
  bundled font file) → brand bar + logo overlay → optional royalty-free music bed → 1080x1920.
- Runs as a Temporal activity with concurrency 1–2 per worker; FFmpeg installed in our image.

### F6. Autopilot
- New model `BrandSchedule`: postsPerWeek, channels, format mix (image/video/text %),
  preferred times, autoApprove.
- A Temporal scheduled workflow per org runs weekly: picks keywords/topics → generates copy
  (reusing the agent pipeline's hook/content steps, fed with the Brand DNA instead of a free
  prompt) → renders media → creates posts as **drafts** in the review queue, or schedules them
  directly when autoApprove is on.
- New workflows only; never edit upstream workflows (upstream rule).

### F7. Review queue
- New page `/autopilot`: cards with preview (image/video), copy, target keyword, channel,
  proposed time. Actions: approve, reject, regenerate copy, regenerate media, open in the
  existing post editor.

### F8. White-label
- Env-driven product name, logo, colours, favicon, email sender; Postiz branding removed
  from the UI; our own landing/login copy. Registration control stays via
  `DISABLE_REGISTRATION`.

### F9. LLM abstraction
- One `LlmService` wrapping the existing OpenAI usage so the model and provider are env-driven
  (`LLM_PROVIDER=openai|anthropic`, `LLM_MODEL=...`) with a per-call token cap. Existing
  `gpt-4.1` call sites are routed through it gradually.

---

## 4. Where the new code lives (follows upstream conventions)

```
libraries/nestjs-libraries/src/
  brand/            brand.service.ts, brand.repository.ts, brand.scraper.ts (Playwright), dtos
  stock/            stock.manager.ts, pexels.provider.ts, unsplash.provider.ts
  render/           image.renderer.ts (canvas templates), video.renderer.ts (ffmpeg), fonts/
  autopilot/        autopilot.service.ts, autopilot.repository.ts, dtos
  llm/              llm.service.ts
apps/backend/src/api/routes/
  brand.controller.ts, autopilot.controller.ts
apps/orchestrator/src/workflows/
  brand-autopilot.workflow.ts (+ activities)      # new files only
apps/frontend/src/app/(app)/(site)/brand, /autopilot
apps/frontend/src/components/brand, /autopilot
```
Layers: DTO → Controller → Service → Repository (Prisma only, no raw SQL). Provider-specific
logic goes into providers, never into generic code.

---

## 5. Build order

| Phase | Deliverable | Done when |
| --- | --- | --- |
| 0 | Dev environment + our own Docker image builds and boots (Postgres, Redis, Temporal, ffmpeg, Playwright chromium inside) | login works on the new instance, one channel connects, a manual post publishes |
| 1 | F1 Brand DNA (model + form + website auto-fill) | brand saved; scraping a real site fills ≥80% of fields |
| 2 | F3 + F4 stock photos + image templates | "Generate image post" from the brand yields a branded 1080x1350 in the media library |
| 3 | F9 + copy generation from Brand DNA (reusing agent hook/content steps) | one click produces 5 drafts with images for a chosen channel |
| 4 | F6 + F7 autopilot + review queue | weekly batch appears in the queue; approve → scheduled; autoApprove → scheduled directly |
| 5 | F5 video renderer | a branded 9:16 captioned video posts to Instagram Reels/TikTok |
| 6 | F2 keyword plan + coverage view, F8 white-label polish | product demo-ready |

---

## 6. Hosting and dev environment (open decision)

**Requirements for the stack:** ~4 GB RAM steady (backend + orchestrator + frontend + Temporal +
Postgres + Redis), 2+ vCPU, 40 GB+ disk (media and video renders grow), ffmpeg and Chromium
inside the image.

**Current TaxiDex VPS (195.88.87.51):** 6 vCPU, 11 GB RAM (~5 GB available), root disk 88% full
(13 GB free), no ffmpeg. Not suitable as-is; would need a disk clean-up first and would share
resources with the live product.

**This Windows machine:** Node 20 (needs 22), no pnpm, no Docker, no WSL, ~2 GB RAM free.
Cannot run the stack. Code can be written here; running/testing needs a Linux box.

**Recommendation:** a dedicated small VPS (4 vCPU / 8 GB / 100 GB) used both as the dev box
(devcontainer target of `Dockerfile.dev`) and later as the first production host. Code flows
GitHub → VPS.

---

## 7. Licence, keys, costs

- Postiz is **AGPL-3.0**. Offering a modified Postiz as a hosted service requires making the
  modified source available to users. Plan: keep the fork in a public (or source-available)
  GitHub repo with no secrets; the brand-engine code ships with it.
- Keys needed: one master LLM key (OpenAI now, Anthropic optional), Pexels key (free),
  Unsplash key (free, production tier needs approval), social app credentials per provider
  (Facebook/LinkedIn app ids can be copied from the existing instance but each deployment
  needs its own redirect URLs registered).
- Per-post cost ≈ LLM tokens only (sub-cent at 350 max tokens for copy; more if we let the
  model also write the image query and alt text).

---

## 8. Not in scope for v1
Paid image/video generators (keep upstream's fal/HeyGen but off by default), analytics beyond
what Postiz has, Polotno editor key, mobile app, billing/Stripe.

---

## 9. Build log and deviations from this spec

**Phase 1 (done):** brand profile, website auto-fill (jsdom scraper + AI summary), Brand tab in Settings.

**Phase 2 (done):**
- Images render with **`@napi-rs/canvas`**, not `canvas`: the `canvas` package's native module is not built in the Docker image (pnpm blocks its build script) and needs system graphics libraries. `@napi-rs/canvas` ships prebuilt binaries.
- **Pexels only** for now. Unsplash is deferred: its API terms require production approval and a download-tracking call per use. The provider interface leaves room for it.
- Templates: photo with headline, quote card, brand card (carousel and stat card come later). Sizes: feed 4:5, square, landscape, story 9:16.
- Logos and photos are decoded only if they are PNG, JPEG or WebP. SVG is refused because the renderer would resolve whatever files or URLs it points at.
- Fonts in the image: Inter, DejaVu, Noto core (many scripts) and Noto Color Emoji. **CJK is not included** (about 100 MB); add `fonts-noto-cjk` if Chinese, Japanese or Korean customers appear.
- Needs `PEXELS_API_KEY` (free). Without it the quote and brand cards still work.
