# tier-bench product and implementation plan

Revised 21 August 2026 after product clarification and live OpenRouter catalog research.

## 1. Product contract

tier-bench answers: “How does the community feel about the important AI models right now?” It is a sentiment product, not an objective benchmark. Everyone can browse every community leaderboard, model distribution, comment thread, methodology page, public shared snapshot, and developer documentation. Creating or changing a ballot, commenting, proposing, voting, sharing, or creating an API key requires an account.

The project is a non-commercial community project. That makes Vercel Hobby’s personal/non-commercial terms acceptable for the validation period, subject to its limits. If this intent changes, hosting must move to Vercel Pro or the existing VPS before monetization begins. See [Vercel Hobby terms and allowance](https://vercel.com/docs/plans/hobby).

## 2. Official boards

Launch with six boards:

1. Overall
2. Chatting
3. Math
4. Code quality
5. Steerability
6. Most value

There is no “Performance only” board. Community members can propose more subtierlists. Proposals receive one changeable up/down vote per account. Votes surface demand but do not directly create production categories; an admin resolves duplicates, clarifies the question, and may run a community beta.

Each category publishes a concrete prompt. “Steerability,” for example, means instruction following, controllable style and initiative, and reliable course correction. This reduces the chance that voters answer different questions under one label.

## 3. Default catalog: product lines, not a fixed count

There is no hardcoded 20-model limit. The initial configuration has 19 tracked product lines because that is the supplied set. The number visible is determined by active product lines plus any predecessor still in its 72-hour overlap. Admins can disable a line, manually add a standalone model, or remove a model from the current default bench without deleting its history.

As of the research date, the seeded releases are:

| Product line | Current seeded release | Discovery source |
|---|---|---|
| Fable | Claude Fable 5 | OpenRouter |
| Mythos | Claude Mythos 5 | Anthropic official source; not on OpenRouter |
| Opus | Claude Opus 5 | OpenRouter |
| Sonnet | Claude Sonnet 5 | OpenRouter |
| GPT Terra | GPT-5.6 Terra | OpenRouter |
| GPT Luna | GPT-5.6 Luna | OpenRouter |
| GPT Sol | GPT-5.6 Sol | OpenRouter |
| GLM | GLM 5.3 | OpenRouter |
| DeepSeek | DeepSeek V4 Pro 0813 | OpenRouter |
| Xiaomi MiMo | MiMo-V2.5-Pro | OpenRouter |
| Mistral | Mistral Medium 3.5 | OpenRouter |
| Qwen 27B | Qwen3.8 27B | OpenRouter |
| Qwen Max | Qwen3.8 Max | OpenRouter |
| Muse | Muse Glimmer 30B | OpenRouter |
| Inkling | Inkling Small | OpenRouter |
| Gemini Pro | Gemini 3.1 Pro Preview | OpenRouter |
| Gemini Flash | Gemini 3.7 Flash | OpenRouter |
| Kimi | Kimi K3 | OpenRouter |
| Grok | Grok 4.6 | OpenRouter |

OpenRouter exposes a catalog endpoint with canonical slugs, names, timestamps, context, architecture, descriptions, and pricing, and supports `sort=newest`. See its [Models API documentation](https://openrouter.ai/docs/guides/overview/models). Canonical slugs are stored as durable release identity; the human-facing API ID may be updated as an alias changes.

Mythos is a necessary exception. Anthropic documents Mythos 5 as a limited-access release, but it is not present in the current OpenRouter catalog. It is seeded from [Anthropic’s official Mythos page](https://www.anthropic.com/claude/mythos). The configured rule will automatically take over if OpenRouter later exposes a matching canonical release. OpenRouter cannot discover models it does not list, so the admin may also update this exceptional line from an official source.

## 4. Automatic release detection

Every product line stores:

- author/provider identifier;
- inclusion regex;
- exclusion regex for variants such as `:batch`, `:free`, `fast`, `preview`, or specialized image/code variants;
- current model ID;
- automatic-publish flag;
- active flag and display order.

A GitHub Actions workflow calls the protected sync endpoint every ten minutes. GitHub schedule timing is not guaranteed, so “every ten minutes” is polling intent, not an SLA. The sync is idempotent and safe to retry.

For each enabled line:

1. Fetch the complete text-model catalog with `sort=newest`.
2. Refuse suspiciously short responses rather than treating a partial response as complete.
3. Exclude aliases and static variants.
4. Apply the line’s exact author/inclusion/exclusion rules.
5. Select the greatest OpenRouter `created` timestamp.
6. If it is newer than the stored current model, insert it once by canonical slug.
7. Publish it immediately when the line is trusted for automatic publishing.
8. Set the predecessor’s `visible_until` to `now + 72 hours`.
9. Move the line’s current pointer to the new release.
10. Create idempotent notification-outbox jobs and an audit event.

Visibility is evaluated from timestamps in every catalog query. The old model disappears from new ballots after 72 hours even when the scheduler is late. It remains in old ballot revisions, shared snapshots, comments, model history, and API history.

Unmatched OpenRouter releases are not imported. Otherwise hundreds of fine-tunes, free variants, image models, and narrow models would overwhelm the default bench.

## 5. Ranking experience and privacy

The mobile interaction uses tap-to-select followed by a tier, with drag/drop available on desktop. Users may leave unfamiliar models unranked and must place at least five to publish. Within-tier ordering is stored for the personal presentation but the v1 aggregate uses tier values only.

There is one current ballot per `user × category`. Saving appends an immutable revision and changes the current-revision pointer. Editing therefore replaces a member’s previous influence instead of granting a second vote.

All working benches are private. The Share button opens a modal with two explicit choices:

- **Copy a link:** create a new immutable shared revision URL.
- **Save a picture:** render and download a 1200×630 tier-list image in the browser.

A shared link never silently changes after a later edit. Public/private state is not inferred from having saved a ballot.

## 6. Aggregation

S through F map to 6 through 0. For each model/category, compute the observed mean from current ballots that ranked that model. Abstention does not become a zero.

The published score uses a transparent Bayesian mean:

`(n × observed mean + 10 × category baseline) / (n + 10)`

The baseline is the current category mean. Ten equivalent ballots prevents a release with two enthusiastic voters from looking more certain than an established model with hundreds. The page also publishes unique voter count and the complete S–F distribution. Stable score bands determine the visible tier; score and voter count order models within it.

The algorithm version is stored on each immutable snapshot. Method changes require a changelog and new version rather than silently rewriting the meaning of old output.

## 7. Public UI and perceived freshness

There are no pulsing “live” dots, “updated two minutes ago” labels, or five-minute warnings in the primary UI. Freshness should be felt through numbers and ordering changing between visits. A small methodology/footer footnote discloses that public results may be cached for up to five minutes.

Public pages read precomputed leaderboard snapshots, never aggregate raw ballots on every visit. The first qualifying read or write after five minutes refreshes a category snapshot. CDN responses use a five-minute shared cache and stale-while-revalidate. This protects Neon and makes traffic spikes cheap.

## 8. Model page

The information order reflects why people visit:

1. Current community rank.
2. Large S–F distribution in the same visual language as a tier list.
3. Position and score across all six boards.
4. Community comments.
5. Factual metadata at the bottom.

Comments require an account and are anonymous by default. The displayed anonymous animal alias is deterministic within a model thread, so a conversation remains legible without exposing the handle. A member may deliberately check “show my handle.” Comments are length-limited, rate-limited, validated, and subject to moderation status.

Facts include exact release/listing date, context length, modalities, OpenRouter price where available, description, and source. These facts do not dominate the sentiment view.

## 9. Admin control room

The dashboard provides:

- ballot/member/comment/email-queue counts;
- manual OpenRouter sync and recent sync status;
- current release and matching rule for each product line;
- enable/disable line toggle;
- trusted auto-publish setting in the data model;
- manual model addition with official source and release date;
- reversible removal from the default bench;
- immutable before/after audit events.

Removing means `status=hidden` or disabling the current line. It does not cascade-delete ballots, comments, history, or shares.

## 10. Email notification behavior

Release emails are opt-in. Automatic publication creates an outbox job keyed by `model_id + user_id`, preventing duplicate delivery across retries. The job worker sends a deep link to the Overall ranking editor. Provider failure does not roll back catalog publication; failed jobs retry and eventually enter a failed state for admin inspection.

Resend Free currently allows 3,000 transactional messages/month and 100/day. See [Resend pricing](https://resend.com/docs/knowledge-base/what-is-resend-pricing). The worker therefore drains at a bounded rate. When the audience grows, use digests/segmentation or upgrade rather than silently dropping mail.

## 11. Developer API

API v1 exposes GET only:

- `/api/v1/leaderboards`
- `/api/v1/leaderboards/{slug}`
- `/api/v1/models`
- `/api/v1/models/{id}/history`

The frontend’s internal write routes are not part of `/api/v1`. Developer keys are high-entropy, shown once, stored as a one-way SHA-256 digest with an environment pepper, named, revocable, and last-used tracked. Public cached reads remain possible for experimentation. Production should give the API path a separate database role with SELECT only on published views as an additional hard boundary.

## 12. Stack and cost

- Next.js 16 + React 19 + TypeScript on Vercel.
- Clerk for production identity; a clearly labeled local-only demo account when keys are absent.
- Neon Postgres in production; PGlite persistence for zero-setup local development.
- Direct OpenRouter public catalog API; no paid inference is performed.
- Cloudflare Turnstile for server-verified write challenges.
- Resend for email.
- GitHub Actions for ten-minute polling and daily backups.
- Encrypted `pg_dump` files in private Cloudflare R2.

Current relevant allowances include [Clerk Hobby up to 50,000 retained monthly users](https://clerk.com/pricing), [Neon Free’s scale-to-zero database allowance](https://neon.com/pricing), [free unlimited Turnstile challenges](https://developers.cloudflare.com/turnstile/plans/), and [R2’s 10 GB-month free Standard storage](https://developers.cloudflare.com/r2/pricing/). These are not SLAs and must be rechecked before launch.

## 13. Security baseline

- Authenticate and authorize inside every write handler.
- Never trust a client-supplied user ID or role.
- Validate all JSON with Zod and parameterize every SQL value.
- Verify Turnstile server-side; tokens are single-use and expire after five minutes.
- Apply atomic database-backed limits to ballots, comments, proposals, votes, shares, and key creation.
- Use exact catalog match rules and reject suspiciously incomplete upstream responses.
- Use idempotency keys for catalog entries, notifications, and external email calls.
- Keep admin changes reversible and audited.
- Minimize local identity data and provide account notification controls.
- Back up daily with gzip + AES-256/PBKDF2 before upload to a private R2 bucket.
- Test a restore into an isolated database before public launch and quarterly afterward.

## 14. Production launch checklist

1. Create Neon database and apply schema.
2. Configure Clerk production keys and set the owner’s Clerk ID in `ADMIN_CLERK_USER_IDS`.
3. Configure Turnstile production hostname and both keys.
4. Configure `CRON_SECRET`, GitHub `APP_URL`, and workflow secrets.
5. Configure a verified Resend domain, opt-in text, and unsubscribe behavior.
6. Configure R2 private bucket, restricted API token, backup passphrase, and lifecycle retention.
7. Add a strong `API_KEY_PEPPER`.
8. Run unit, type, build, endpoint, authorization, rate-limit, and mobile tests.
9. Run the encrypted backup restore drill.
10. Invite 30–100 beta members, inspect completion and moderation load, then launch.

## Questions still worth validating in beta

- Do members interpret “Steerability” consistently after reading the prompt? A: how much does the model follow instruction instead of just doing what he wants.
- Should Inkling Small replace Inkling in the generic line, or should these be distinct lines? A: it should replace
- Should Muse Glimmer replace Muse Spark in a generic Muse line, or should the line follow Spark only? A: distinct line
- Should the generic Mistral line follow newest Large/Medium, or only Mistral Large? A: only the large version
- Do limited-access Mythos opinions have enough genuine users to remain on a public sentiment board? A: yes

