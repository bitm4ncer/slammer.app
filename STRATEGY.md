# slammer.app — Strategy

> Why this tool exists, how it stays free, how it pays for itself.
> Public on purpose. The community deserves to know the plan.
>
> Last revised: 2026-05-07

---

## Why slammer exists

Adobe is too expensive, too cloud, too corporate. Affinity is great for production but conservative. Procreate is iPad-only. Most generative-art tools are either pro-grade and brittle (TouchDesigner, Cavalry) or polished but locked-in (Canva, Figma).

**slammer.app is a browser-native graphics editor for the people Adobe lost.** Anti-subscription, AI-curious, glitch-friendly, generative, weird. Built around layers, non-destructive effects and a VST-like plugin system — so the tool can grow without bloating.

It runs in a browser. No login required, no cloud, no telemetry beyond anonymous page views. Your projects live in your browser's IndexedDB and in `.slammerproj` files on your disk. That's it.

---

## Audience

If you fit two or more of these, you are the tribe:

- You picked Affinity, Procreate or Krita over Adobe.
- You play with AI image generation but want to own your tools, not rent them.
- You like glitch, halftone, riso, generative, brutalist, weird.
- You'd rather pay once than subscribe forever.
- You discover tools through YouTube tutorials, not LinkedIn.

If you wanted Canva, this is not for you. That's fine.

---

## How slammer pays for itself

slammer is a small operation run by one person under the **Bitmancer** brand. The app is free. Revenue comes from a small in-app shop — the **Bitmancer Library** — that sells plugins, effects, vector tools and asset packs **à la carte**. No subscription. No DRM. Pay only for what you actually use.

**Four price tiers, all one-time purchases:**

| Item | Price range | What you get |
|---|---|---|
| **Single plugin or effect** | €5–10 | One focused capability — a specific effect, generator, or tool |
| **Asset pack** | €5–15 | A texture set, gradient library, vector kit, font bundle, or project templates |
| **Themed bundle** | €15–25 | 3–4 related plugins or asset packs with ~30 % bundle discount |
| **Slammer Pro Lifetime** | €99–129 | Every Bitmancer-made plugin, current and future, for the lifetime of v1.x |

The lifetime tier is for users who already know they want the whole Bitmancer ecosystem. It is not a subscription, never auto-charges, and includes any plugin Bitmancer ships under the slammer.app project for the v1.x major version. v2.x in future years would be a paid upgrade — typical Affinity cadence.

Existing Bitmancer customers on Gumroad keep their purchases. New inventory ships through the Library; legacy texture packs remain on Gumroad and are not migrated.

---

## What stays free

The free app is fully functional. No watermarks, no feature gates, no export limits, no online activation requirement.

Three stages of "free":

1. **Pre-public-launch (the early days):** the project was in private development. The exact split between what becomes free and what becomes an add-on was still in flux as features matured. Nothing was locked yet.

2. **Public BETA (current stage):** slammer.app is deployed to a public URL but the **Bitmancer Library shop has NOT launched yet**. During the BETA period, all add-on plugins (Datamosh, JPEG Compression, Stipple, Plastic, Holographic Foil, Reaktor, Slime Mold, etc.) are **unlocked for free** so beta testers can use the full feature set. The scope of what's permanently free vs. what becomes a paid add-on is NOT locked yet — we may move plugins between tiers based on what feels right during the BETA. **Beta-tester goodwill commitment**: anything installed and used during the BETA stays unlocked on your machine when the shop launches — no surprise paywalls retroactively applied to existing users.

3. **At shop launch (when the Bitmancer Library opens for purchases):** the **Free Tier scope is locked**. Whatever's marked as free in the public repository on shop-launch day stays free under AGPL-3.0, **forever**. From that point on, the free side never gets smaller — only better. Bug fixes, UX wins, polish, and additions to free plugins keep flowing. Add-ons = new capabilities only, never unlocked-handcuffs of free ones. New users arriving after shop launch pay for the add-ons.

If you fork slammer the day after shop launch, you have a fully working editor that doesn't need a license for anything marked free in the repo. That is the point.

---

## How we decide what's an add-on

Free vs. add-on is decided by three filters. Anything that fails one of them does not get sold.

1. **Tutorial Test** — Could we make an honest 7+ minute YouTube tutorial about it that wouldn't bore the viewer? If a video about it would feel like filler, the plugin is too thin to charge for.
2. **2-Hour Test** — Would a competent user need 2+ hours to recreate the result themselves? A add-on plugin must do real work, not just expose a slider with a wider range.
3. **Eigengeld Test** — Would the maintainer actually pay €5+ for this if they were a user? Honest answer "I'd hesitate" → users will hesitate too.

If a plugin fails any of these tests, the options are: ship it free, fold it into an existing plugin, or don't ship it. Better an empty Library shelf than one full of dead weight.

This is a deliberate defense against the CapCut / late-Adobe failure mode where add-on tiers get bloated with features nobody asked for, just to justify the price.

**Bundle rules.** Themed bundles are workflow-coherent — "Glitch Pack" = related effects that belong together in a workflow. We do not bundle "5 random plugins at 30 % off."

**Free-tier rules.** Improvements to free plugins keep shipping. Bug fixes, UX wins, sensible defaults — all stay free. We do not sabotage the free side to push add-ons.

---

## How the shop works

slammer is licensed AGPL-3.0. That covers the editor, the plugin registry, every plugin in this repo, and the Bitmancer Library plugin itself (which is free and open source, in this repo).

**Add-on plugins, asset packs and Pro effects are separate works.** They live in a private Bitmancer repository, are built into separate JS bundles or content ZIPs, sold through [Polar.sh](https://polar.sh), and loaded into slammer at runtime through the documented public plugin API. They are not derivatives of slammer — same legal pattern as VST plugins for Ableton, Photoshop plugins, Sublime Text packages, kernel modules.

**Why Polar.sh:** open-source platform (Apache 2.0), acts as Merchant of Record so EU VAT and global tax compliance are handled automatically, native license-key API, indie-creator focused. Transaction fee is 4 % + €0.40. We chose it specifically because the values match the project — open source, indie, European-led.

**The flow:**

1. You browse the Bitmancer Library inside slammer. Add-on items show their price next to the icon.
2. You click *Buy* → Polar checkout opens in a new tab. Polar handles payment, currency, and EU VAT as Merchant of Record.
3. Polar issues you a license key.
4. You paste the key into Settings → Library — or it is detected automatically if you returned via the in-app *Buy* button.
5. The Library plugin (free, AGPL, in this repo) calls a small **Cloudflare Worker**, which validates the key against Polar's API and returns a short-lived signed token listing the items you own.
6. With the token, the Library downloads your owned bundles from a **Cloudflare R2** bucket and registers them in slammer's plugin system.
7. Locked items in the Effects menu show a small price tag. Click → buy modal.

**No DRM.** The bundles are plain JavaScript. A determined person could share them — but that is true of every JS-shipped product, and chasing pirates costs more than it saves. Honor system.

---

## How you keep your purchases

Two ways, both work — pick whichever you prefer.

**License key (the always-works default).** Polar emails you a key when you buy. Paste it into slammer (Settings → Library) and the plugin activates. Same key works on every device you own — paste it again on the next machine. If you lose the email, request a resend from Polar's customer portal. No login required.

**Sign in to Polar (the convenience layer).** One click in Settings → Library opens a Polar sign-in window. Once you're signed in, slammer pulls all your purchases automatically — every plugin, asset pack, and the Lifetime tier if you have it. New devices: sign in, everything appears. Stop using a device: sign out and the plugins lock until you sign in again or paste the key.

Polar offers email magic-link sign-in plus social OAuth (Google, GitHub) where available. We never run our own identity system, never store your password, never send marketing email.

**Free copies for friends and press.** We give them out as Polar discount codes that take the price to €0. The recipient checks out normally with the code, gets a real license key, activates exactly like a paying user. If you're testing slammer for a review or you're a friend who wants the full version — ask.

**What we do NOT do.** No login required to use slammer. No GitHub account requirement to store your projects (your `.slammerproj` files stay on your machine, end of story). No device limits, no online activation requirement, no telemetry on which plugins you use.

---

## License

slammer is released under [AGPL-3.0-or-later](LICENSE). You can:

- Use it, study it, modify it, redistribute it.
- Build your own plugins for it under any license, including proprietary.
- Run it on your own server or self-hosted.

The AGPL specifically requires that, **if you run a modified version of slammer as a network service**, you publish your modifications. This is the only meaningful restriction. It protects against a competitor taking the code and offering "Slammer as a SaaS" without contributing back.

---

## How we make content (the honest answer)

slammer is built and marketed by one person while holding a day job. There is no "growth team," no content calendar, no engagement squad. Promising "a video every two weeks, no excuses" would be a lie that ends in burnout.

Instead:

- **Tutorials drop when a feature is ready, not on a calendar.** Polished, narrated with AI voice, each one teaches a real workflow. These convert viewers into users.
- **Devlogs / build-in-public videos** appear when something interesting actually happens. Casual, edited but raw, in the creator's own voice. These build the tribe but don't carry the marketing weight.
- **The YouTube channel hosting all of this** is [@bitmancer](https://www.youtube.com/@Bitmancer) — historically focused on Affinity tutorials. Affinity content continues at reduced cadence. slammer content phases in over months, not overnight, because a hard pivot would alienate the existing audience.
- **There is no engagement bait.** No "smash that subscribe button" out of context. If you find the videos useful, the algorithm will figure it out.

We will not pretend to ship faster than we do. We will pretend less than most software companies do.

### User-amplification (the flywheel we actually want)

The maintainer can't ship enough tutorials alone. The audience can — if we make recording effortless. **Roadmap [F7](roadmap.md#f7--tutorial-recorder-in-app-screen--mic-capture) ships an in-app screen + mic recorder** built on browser-native APIs (no third-party tools, no plugin install, no account). One click, screen + audio + optional webcam PiP, save as WebM. The friction between "I just made a cool glitch" and "this is on my Twitter" should be twenty seconds, not twenty minutes.

This is not a feature; it's distribution infrastructure. Every user who posts a slammer recording is a free billboard pointing at a tribe member who didn't know slammer existed yet. The recorder stays free forever — gating it behind Pro would defeat the entire mechanic.

---

## What we will not do

A short list of things that have come up and been deliberately set aside:

- **No subscription.** Not for the app, not for Pro, not for plugins. The tribe values one-time payment; we listen.
- **No cloud account, no telemetry beyond anonymous page views.** Your projects belong to you, on your machine. Concretely (v1): **Cloudflare Web Analytics** records page views, unique-visitor counts (cookieless, derived without identifiers), country-level location, browser/OS family, and referrers. No cookies. No fingerprinting. No tracking of which effects you use, what your layers contain, where you click, or how long you stay. A **Settings → Privacy** toggle disables the beacon entirely. We honour Do-Not-Track. If a future product question genuinely needs richer engagement data, we'll migrate to a self-hosted EU stack (Plausible on Hetzner or Umami on Cloudflare Pages + Supabase) — same privacy posture, same opt-out. See [roadmap.md → Phase 28 → Analytics](roadmap.md#analytics--dsgvogdpr-compliant-options-open-source--eu-hosted-only).
- **No upgrade nag screens, no popups on launch, no "complete your account."** Add-on items advertise their existence with a small price tag in the menu, that's it.
- **No NFT, no crypto, no Web3.** It's 2026, the answer is still no.
- **No "AI features that talk to our servers."** All AI features are bring-your-own-key (fal.ai). We never see your prompts or outputs.
- **No DRM, no online activation requirement.** Honor-system licenses.
- **No removal or deprecation of free features to push add-ons.** What is marked free at shop launch stays free.
- **No third-party plugin marketplace** in v1. Plugin developers can sell their own work directly. A community marketplace is a long-term goal (see roadmap **F4**), not a v1 deliverable.
- **No mobile apps** in v1. Browser-only.
- **No "AI-generated" filler plugins.** Every add-on item must pass the three tests above.

---

## Roadmap

For the technical roadmap, see [roadmap.md](roadmap.md). Monetization and Pro infrastructure are tracked there as **Feature F3 — Slammer Pro & Bitmancer**.
