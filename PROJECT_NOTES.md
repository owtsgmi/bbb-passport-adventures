# BBB Passport Adventures — Project Notes

This file is the persistent source of truth for future edits to this project.

## Publishing / tooling
- GitHub repo: `owtsgmi/bbb-passport-adventures`
- Branch: `main`
- Live site: `https://owtsgmi.github.io/bbb-passport-adventures/`
- ChatGPT has been publishing directly to this repo through the GitHub connector. Before saying repo access is unavailable, check the available GitHub tools first.
- Always fetch the current `index.html` SHA before updating it.
- Do not parallel-write the same file path.

## Current game rules
- Adventures are exactly **3 passport stops** each.
- Stable adventure dataset: **381 stamps = 127 adventures**. The live BBB/StaFi passport total can be higher and changes independently.
- A run completes when **any snapshotted participant gets all 3 stamps**. Solo clubs work normally, and multi-player clubs do not require everyone to finish.
- Each completed 3-stop adventure can reveal one **random 20–100 L$ mystery reward** when Adventure Treasure is enabled.
- The reward recipient is the **second/player-two SL username** (👽 tab), while the **first/player-one SL username** (🗡️ tab) is the sponsor/payer.
- The L$ amount stays hidden until the first participating player reaches 3/3. A completed adventure gets one persisted random reward; reopening or switching devices must not reroll it.
- Reward ownership does not change when switching tabs.
- Both tabs show passport progress. Reward ownership stays with the second SL username; revealed prizes accumulate toward the next fixed 1,000 L$ payout.

## UI
- Two configurable player tabs use the players' **actual Second Life usernames** as their labels.
- Player-facing header should stay intentionally simple:
  - title: **Bellisseria Passport Adventures**;
  - short subtitle: **Pick a 3-stop adventure, collect BBB stamps, and explore Second Life.**
  - keep the top header free of action buttons;
  - **Settings** lives in the hamburger menu, not beside the passport counter;
  - keep a prominent top-right passport completion counter for the selected player. When StaFi is connected, use the live StaFi summary, e.g. **1 / 390**, with the remaining stamp count below it. This is the primary game goal and should remain visually prominent;
  - no cloud-sync text, StaFi-link count, payout status, notification diagnostics, or other technical/admin status in the header.
- **Potential Adventures** is a collapsed section by default, matching the compact behavior of Finished Adventures. Its summary shows the pending count; opening it reveals the area filter and pending list.
- **Current Adventure** sits above it and auto-opens when a current adventure exists. Do not force it back open on every render after the user manually collapses it.
- The empty Current Adventure state contains the single **Pick Random Adventure** action; do not duplicate that random button inside Potential Adventures.
- There is **no adventure text-search field** on the Adventures page; keep the area dropdown.
- There is **no per-adventure participant picker**. Starting an adventure automatically snapshots **all currently active club players** as that adventure's participants.
- **Pick Random Adventure** remains the prominent quick-start action above the pending adventure list.
- Keep adventure stop lists clean: do **not** render the old `missionSetup` Travel / Next stop / Copy destination strip above stop rows. Per-stop Copy buttons are enough.
- Current Adventure loads open.
- Adult-playful purple/pink/gold style with subtle alien graphics.
- Settings is a standalone page at `settings.html`, linked from the hamburger menu on Adventures and supporting pages.
- Do not reintroduce the inline Settings panel on `index.html`; the main Adventures page should remain focused on gameplay.
- Settings is organized as two distinct steps: **1) User Account** and **2) Clubs**. After sign-in, account/profile/StaFi controls collapse into a compact **Account details & StaFi** disclosure so club creation/joining is the obvious next step. StaFi remains optional; manual stamp tracking works without it.
- In the Clubs step, the **club picker comes first**. A narrow scrollable box immediately to its right lists the selected club's members by **Second Life username** and updates when the club changes.
- **Create a new club** and **Join an existing club** are compact mutually-exclusive expanders.
- Invites have **two separate contexts**:
  - the currently selected club has its own obvious **Invite players** button beside **Open Adventures**; that action always generates/rotates an invite for the currently selected club;
  - a newly created club shows its initial invite separately inside the **Create a new club** panel immediately after creation.
- Never share the same invite box/button between those two contexts; users must be able to tell whether they are inviting to the currently selected club or viewing the invite generated for a brand-new club.
- The standalone Settings page is player-oriented and allows:
  - first and second player Second Life usernames (also used as tab names)
  - each person's BBB StaFi progress-page URL
  - default tab
  - Secret Club Code
  - a generic **Admin** link
- Keep reward-role/payout wording out of Settings; those details belong on Admin.

## Private settings
- BBB personalized progress pages are called **StaFi progress pages**.
- Never hardcode or expose StaFi URLs in public GitHub source.
- Private settings are persisted in Supabase as client-side encrypted ciphertext.
- Encryption: AES-GCM; key derived in browser from the **Secret Club Code**.
- The Secret Club Code is not stored in Supabase.
- Same Secret Club Code is used on both devices to decrypt shared private settings.

## Supabase
- Project ref: `tzxlrglgwzinefutledx`.
- Shared progress table: `public.bbb_board_state`.
- Encrypted private settings table: `public.bbb_private_settings`.
- Current shared-state row is id=1.
- Adventure progress, current adventure, mystery reward values, and payout history are persisted in Supabase. Legacy Unicorn-Bucks columns may remain in the table for backward compatibility but are no longer part of the app's game model or UI.

## Important implementation cautions
- Do not claim BBB automatic stamp sync is working until the StaFi parser/sync has actually been connected and tested.
- Current StaFi links can be saved/encrypted, but automatic parsing of BBB progress is a separate feature.
- When changing wording, do not blindly global-replace strings that can alter JavaScript function names.
- After edits, inspect the updated source for syntax damage before telling the user it is fixed.
- Preserve the user's personal/fun design now; generalize for other couples/friends only later if requested.


## Total passport counter
- The top stamp counter shows the **full live passport total**, not only the fixed 381-stamp adventure subset.
- A verified private StaFi page exposes a summary with **collected**, **uncollected**, and **all currently available stamps**. Store only those derived counts for club-visible progress; never expose the raw private StaFi URL.
- Current verified example from StaFi (2026-09-22/23): **1 collected + 389 uncollected = 390 currently available**. Treat 390 as a live observation, not a new hard-coded constant.
- Display format includes collected/total and remaining, e.g. **1 / 390 · 389 to go**.
- Adventure rewards still use only the stable 381 campaign stamps grouped into 127 three-stop adventures.


## Navigation / extra pages
- Site now uses a hamburger menu with:
  - Adventures: `index.html`
  - Instructions: `instructions.html`
  - BBB Passport Stops: `bbb.html`
- Instructions page must state clearly that the current Secret Club Code/shared-state design supports exactly **2 players** for now.
- BBB Passport Stops page is a user-friendly searchable catalog of the current indexed campaign stop dataset.
- Stop catalog supports text search, area filtering, collected/needed filtering, Firestorm destination copy, and a selected-stop detail view.
- Selecting a stop shows **6 nearby suggestions**. Nearby ranking is conservative: same-region coordinate distance first; then same broader area; it must not claim full grid-distance accuracy without reliable global region coordinates.
- Current catalog indexes the 381 campaign stops. The user's pre-campaign Bryggen stamp is counted in the whole-passport counter but is not yet a row in the campaign stop dataset.


## BBB live catalog refresh
- The BBB Passport Stops page refreshes its public BBB catalog data **every time the page opens**.
- Client calls the Supabase Edge Function `bbb-stamp-assets` with `cache: no-store` and a cache-busting query parameter.
- Edge Function fetches the public BBB stamp catalog fresh, parses map SLURLs/coordinates and available images, and returns structured live data with `fetched_at`.
- Existing built-in campaign stops are matched by exact region/coordinates first, then normalized name. Matching live data can refresh URLs/images.
- The Adventures page now reuses those original BBB images as thumbnails beside each passport-stop location. It fetches the live BBB catalog through `bbb-stamp-assets`, matches by region/coordinates then normalized name, proxies images through the same Edge Function, uses lazy loading, and falls back to a map-pin placeholder when a photo is unavailable.
- A local `bbb-adventure-image-cache` is used only as a fallback when the live BBB catalog/image lookup is temporarily unavailable.
- `bbb-stamp-assets` now prefers the BBB HTTP catalog URL first because the HTTPS endpoint can stall. Each live fetch has a bounded timeout.
- The original BBB photos are hosted on `picture-service.secondlife.com`; the image proxy allowlist includes that host. For HTTPS Second Life picture-service URLs, the client loads the image directly for speed.
- Shared server cache table: `bbb_catalog_cache`. Normal page loads return the cached 388-stop catalog quickly instead of scraping BBB on every visit.
- Supabase cron job `bbb-catalog-refresh` refreshes the shared BBB catalog every 6 hours with a longer timeout. Stale cached data is used if BBB is temporarily unavailable.
- The BBB Passport Stops page uses larger photo thumbnails in the main stop list, a larger selected-stop photo, and photos for nearby/random-stop cards.
- Newly discovered BBB stops are added to the stop catalog as **BBB Live** entries without altering the 127 three-stop adventure/reward dataset.
- Last successful public BBB catalog response is cached locally only as a fallback if BBB is temporarily unavailable.
- UI shows whether the page was refreshed live, is using cached BBB data, or has fallen back to the built-in catalog.
- Do not claim the adventure dataset itself automatically restructures when BBB changes; live BBB additions belong to the searchable stop catalog unless intentionally reconciled into adventures later.


## Living documentation and feedback
- `instructions.html` contains both user-facing instructions and a plain-English **App Architecture** section.
- The instructions and architecture sections are **living documentation**. Any meaningful feature, data-flow, privacy, persistence, sync, page, reward, or user-model change should update those sections in the same development pass.
- Navigation now includes `feedback.html` for public comments, suggestions, and bug reports.
- Feedback is stored in Supabase table `public.app_feedback`.
- There is no user account system for feedback; submitters may enter any display name.
- Public feedback fields: display name, type (suggestion/bug/comment), optional page/area, message, created timestamp.
- Anonymous/authenticated users can read and insert feedback; they cannot update or delete rows through the public client.
- The feedback page must warn users not to post Secret Club Codes, private StaFi links, passwords, or other private information.
- App Architecture should describe:
  - GitHub Pages front end
  - stable 381-stop / 127-adventure game dataset
  - Supabase shared game state and encrypted private settings
  - two-player Secret Club Code model
  - BBB live catalog mirror via Edge Function
  - distinction between live public BBB catalog and private StaFi progress
  - public feedback system
  - current limitations/boundaries



## Owner-only feedback curation
- Public users can submit and read visible feedback, but cannot update or delete it directly.
- Public insert is column-limited to display name, type, message, and page/area. New public submissions are forced to status `open`, not pinned, and not hidden.
- Owner moderation uses the `feedback-admin` Supabase Edge Function.
- Owner actions available: edit, change status (`open/planned/fixed/closed`), pin/unpin, hide/unhide, and permanent delete.
- The feedback page exposes an **Owner tools** panel. The Owner Passphrase is stored only in browser `sessionStorage` after unlock and clears when that browser session ends or the user presses Lock.
- The Owner Passphrase is **separate from the Secret Club Code** used by the two-player game.
- Only a SHA-256 hash of the Owner Passphrase is stored in `public.feedback_admin_config`; the plaintext passphrase must never be committed to GitHub or placed in client JavaScript. The current memorable 3-word dotted passphrase is intentionally low-friction because this is low-stakes.
- `public.feedback_admin_config` has RLS enabled and no anon/authenticated grants. Backend admin access uses Supabase server credentials inside the Edge Function.
- If the Owner Passphrase is ever exposed, rotate it by replacing the stored hash and giving the owner a new code.


## Multi-user direction
- The discarded email/magic-link and original-game claim designs must not be reintroduced.
- Player identity is the actual Second Life username plus a password. No real email address is requested or stored, and there is intentionally no password-recovery flow.
- Couples and larger groups play in independent clubs with owner/admin/member roles, private state, invite links, configurable player rosters, and club-scoped Treasure records.
- Each member owns one private StaFi URL. Club members may see derived stamp progress but never another member's raw StaFi reference URL.
- The global BBB catalog remains shared and read-only; player, club, reward, and payout data remain tenant-scoped.


## Shared Second Life map component
- Reusable map code lives in `slmap.js`.
- It uses Linden Lab's documented map tile pyramid: zoom level 1 is region detail and level 8 is the broadest/world view.
- The map renders a 5×5 tile neighborhood around the current center, supports drag/pan, wheel/buttons for zoom, **Fit**, and **World**.
- BBB Stops page uses this map for the selected stop and gives it substantial vertical space. Selecting a stop maps the **selected stop plus all 6 nearby suggestions** together (7 markers total) and auto-fits the group.
- The Adventures page places a map at the bottom of the current adventure and marks all 3 stops (1, 2, 3); Fit frames the route and World provides broad SL context.
- Region names are translated to grid coordinates through Linden Lab's public region-coordinate capability.
- Do not revert to embedding the maps.secondlife.com SLURL page in an iframe; that approach produced blank embeds.

## Mystery L$ reward model
- There is **no secondary points/currency system**. Unicorn Bucks have been removed from the app because they added an unnecessary extra layer.
- Each completed adventure reveals one random Linden reward from **20 through 100 L$ inclusive** when Treasure is enabled.
- Never show the specific L$ amount before any participating passport reaches 3/3.
- On first qualifying completion, generate the value once and persist it for that run/adventure.
- Completed-adventure UI may reveal the amount; active/pending runs should say **Mystery L$**.
- Once revealed, the prize is added directly to the unpaid payout total. There is no cash-out or conversion step.
- First SL username remains sponsor/payer; second SL username remains reward recipient.
- Payout log stores the actual L$ amount and adventure ID so a completed run cannot be paid twice.
- Historical payout entries and the old `unicorn_redeemed` field are legacy migration data only; do not expose them as a current game concept.


## Adventure stop map selection
- Use **adventure** as the main user-facing term; avoid mixing “run” and “adventure” unless “run” is specifically useful.
- The **Current Adventure** stop rows are map-selectable.
- Clicking a stop row or its **🎯 Focus** button focuses the shared map on that stop at region-detail zoom.
- Selecting a stop must reset previous map manipulation (pan/zoom) before focusing the new stop.
- The automatic **NEXT** indicator is separate from the user's selected map stop. The selected map row gets its own visual highlight / FOCUS tag.
- The current-adventure overview map initially shows all 3 stops; **Fit** restores the adventure overview and **World** shows broad SL context.
- Do not make stops in non-current collapsed adventures control the current-adventure map.


## NEXT indicator semantics
- **NEXT** means the first stop not yet recorded complete for the **currently viewed player**.
- It advances from that player's stamp state, not from map selection.
- The intended behavior is: BBB passport accepts a stamp → StaFi sync imports it → that player's progress updates → NEXT advances. Reaching 3/3 completes the adventure immediately.
- StaFi fetching, summary parsing, scheduled refresh, and current-adventure matching are now connected and server-tested. The remaining field test is to collect one of the three current-adventure stamps in Second Life and confirm it is imported automatically and advances NEXT. Until that live stamp test is completed, describe the integration as connected but awaiting final in-world validation.


## Map tile reliability
- Missing map squares are normally failed/unavailable Linden map tile requests, not meaningful SL regions.
- This is more likely to be **request churn / tile-server availability** than a browser memory leak.
- The shared map now debounces mouse-wheel zoom so one wheel gesture triggers one zoom render rather than many 25-tile request bursts.
- Each tile is retried once after a short delay. If it still fails, the browser shows a clean map placeholder instead of a broken-image icon.
- Failed tile URLs are remembered for 5 minutes in a bounded in-memory cache (max 400 entries) so known-missing tiles are not hammered repeatedly.
- Reusing successful browser-cached tiles is preferred; do not add aggressive cache-busting to normal tile URLs.
- If missing tiles become widespread even after throttling, investigate the Linden map tile service/network before assuming a JavaScript memory leak.


## Cross-device settings sync
- Non-sensitive display settings now live in `bbb_board_state`: `tab_partner_name`, `tab_me_name`, and `default_view`.
- These display settings sync across devices without requiring the Secret Club Code.
- Legacy defaults may still initially show **AA** / **KK**, but the intended setup is to replace them with the two actual SL usernames. The first username is payer; the second is recipient.
- Private StaFi URLs remain in encrypted `bbb_private_settings` and still require the same Secret Club Code on each device. The encrypted payload now contains only StaFi URLs; stale encrypted tab names/default-view values must not override shared display settings.
- The app polls encrypted private settings every 10 seconds when a Secret Club Code is available, so private-setting changes can propagate to another already-open device.
- There is **no device setup link**. New trusted devices must manually enter or paste the same Secret Club Code and use **Load from Cloud**. This intentionally avoids putting the permanent club secret into a shareable URL.
- Do not move raw StaFi URLs or the Secret Club Code into public shared-state columns.


## Header and player icon conventions
- **Hamburger source of truth:** `shared-nav.css` contains the Comments-page navigation pattern for every page. Use the same 46px menu button, absolute left-gutter placement when there is room, 230px dropdown, and stacked mobile fallback. Do not add page-specific `.navwrap` or `.navmenu` rules.
- `index.html`, `settings.html`, `instructions.html`, `bbb.html`, `feedback.html`, and `admin.html` all load `shared-nav.css`. At 1,120px and below the button moves into the header before the left gutter can clip it; at 760px and below the header stacks like the original working Comments page.
- Main title art uses the repo-local `passport-icon.svg`: a crisp navy-and-gold passport booklet designed to keep the word **PASSPORT** and emblem readable at header size. Do not replace it with a detailed photograph that turns muddy when reduced.
- The Adventures header uses a compact two-column grid: branding and player controls stay together on the left, while optional Treasure and passport progress form one horizontal pair on the right. Treasure sits immediately to the **left** of the passport-stamp counter; do not stack it underneath and recreate empty vertical space.
- Desktop navigation hamburger is an icon-only **☰** in the left gutter, vertically aligned with the page title/alien line rather than sitting on its own row.
- At narrower browser widths the hamburger must move inside the header rather than remain in the left gutter, so it is never clipped off-screen.
- Important CSS caution: change shared navigation behavior only in `shared-nav.css`; duplicating responsive `.navwrap` overrides inside individual pages previously caused clipping and CSS conflicts.
- First/player-one tab icon: **🗡️**.
- Second/player-two tab icon: **👽**.
- Use these same icons for the matching Settings labels and StaFi fields.


## Current adventure protection
- The active Current Adventure is **locked by default**.
- Shared lock state is stored in `bbb_board_state.adventure_locked` and synchronized across devices.
- While locked, both **Pick Random Adventure** and any **Make this our adventure** action in the adventure list must refuse to replace the current incomplete adventure.
- The Current Adventure summary contains an **Adventure locked** checkbox so switching requires an intentional unlock.
- Even after unlocking, switching to a different adventure requires an **Are you sure?** confirmation.
- Existing stamp progress in the old adventure is preserved if the user intentionally switches.
- Every newly selected adventure automatically re-locks itself.
- If there is no active incomplete adventure, the lock control is hidden/disabled and choosing an adventure works normally.


## Player reward experience + Settings payout workflow
- The optional reward feature is named **Adventure Treasure** and remains scoped per club.
- Adventure Treasure defaults **OFF** for newly created clubs.
- Any active club member may turn Treasure **ON** from Settings. The member who turns it on becomes the **locked Payer** for that Treasure session.
- While Treasure is ON, only that locked payer may turn it OFF, change **Paid to**, or record **Mark 1,000 L$ paid**. Another player cannot take over until the current payer turns Treasure OFF.
- Turning Treasure OFF releases both Treasure role flags. The next member who turns it ON becomes the new payer. If the payer leaves or is removed from the club, Treasure automatically turns OFF so the club cannot become permanently stuck.
- Payer and Paid to are always different players. The payer is shown as a locked value, not a dropdown; if another active player exists, that payer may choose the **Paid to** player from the remaining players.
- When Treasure is ON, Settings shows the current unpaid balance and progress toward the next 1,000 L$ payment.
- No automatic L$ transfer occurs. The configured payer sends L$ manually in Second Life.
- When at least **1,000 L$** is ready, **Mark 1,000 L$ paid** appears only for the locked payer. It records exactly one 1,000 L$ payment after the real payment has been sent.
- The player-facing Adventures page may show the friendly Treasure experience, but payment bookkeeping stays in Settings.
- The standalone Admin page is retired. `admin.html` redirects to `settings.html`.
- Browser-push, Pay-link, test-money, and Second Life IM/bot setup are not part of the current Treasure workflow. Legacy backend/code may remain dormant but must not be required for normal use.


## Immediate next work
1. **Make StaFi automation the next major focus**
   - verify each private StaFi URL with **Test & enable StaFi** in User Account Settings;
   - confirm automatic checks import confidently identified stamps from the active adventure;
   - confirm imported stamps update club progress and NEXT correctly;
   - keep clear connection/error status in Settings so users can self-diagnose without a separate Admin page.
2. **Re-check Adventure Treasure manually**
   - OFF: Treasure details are hidden;
   - ON: Settings shows payer, Paid to, balance, and manual **Mark 1,000 L$ paid** when due;
   - any club member may claim Treasure while it is OFF; the first enabler is locked as payer until they turn it OFF;
   - no separate Admin page or Second Life bot/IM setup is required.
3. **Re-check player experience with the feature switch**
   - OFF: no L$ treasure panel or Mystery L$ labels;
   - ON: Paid to player sees the friendly Adventure Treasure experience;
   - player pages never expose payment bookkeeping controls.
4. **Automatic BBB StaFi sync remains the major gameplay integration**
   - desired end state: BBB stamp accepted → StaFi updates → app imports stamp → shared progress updates → NEXT advances;
   - do not claim this works until fully connected and tested.
7. **Later public architecture**
   - real auth;
   - club-scoped game state;
   - per-user StaFi;
   - explicit admin/payer roles;
   - per-admin push subscriptions;
   - Adventure Treasure setting per club;
   - RLS hardening.

## Naming / UX decisions to preserve
- Call the optional L$ feature **Adventure Treasure**. Do **not** call it “benefactor mode.”
- Site branding remains unicorn-free. The main app title is **Bellisseria Passport Adventures** (official spelling: Bellisseria). Use the readable navy-and-gold `passport-icon.svg` beside the main title. The browser-tab favicon may remain the alien favicon unless explicitly changed.
- Adventure Treasure defaults **OFF**.
- Keep setup and payment mechanics on `admin.html`, out of the player experience.
- Keep the top of `index.html` clean and game-oriented. Technical connection/sync/StaFi status belongs off the main header; Admin is the home for operational setup and diagnostics.
- Settings should use neutral **first player / second player** language. Do not label the second player as “benefactor” in general Settings.
- The player page should not advertise L$ rewards in its subtitle because Adventure Treasure may be OFF.
- The benefactor should see a fun accumulation of money they are going to receive, not operational payout language.
- Browser payout alerts are desktop/system notifications, not notifications inside the browser tab.
- The realistic test payout notification must explicitly say which saved Second Life username should be paid.
- Second Life IM/bot delivery is **retired from the current product path**. The existing `bot/` source and legacy queue/config tables may remain dormant as historical code, but Admin must not expose bot setup and normal Treasure operation must not depend on it.
- Treasure payment is intentionally manual: pay the configured **Paid to** player in Second Life, then use **Mark 1,000 L$ paid** in Admin.
- **Hard UX constraint:** normal users never rez prims, paste LSL, wear HUDs, configure bots, or manage notification plumbing.

## Multi-user implementation (current)
- The player experience is account/club-only. The signed-out Adventures page redirects to Settings; the old two-player board and migration controls are no longer exposed.
- Identity uses a private SL-username/password service through `passport-auth`. No player email address is collected. Passwords are bcrypt hashes produced by PostgreSQL `pgcrypto`; browsers receive a random opaque session token whose SHA-256 hash is stored server-side. Sessions are revocable and expire after 90 days. There is intentionally no email password-recovery flow.
- The active club id is stored locally as `bbb-active-club`; it is only a preference, never authorization.
- Tenant tables are `profiles`, `clubs`, `club_members`, `club_players`, `club_board_state`, `club_adventure_runs`, `club_run_participants`, `club_stamp_progress`, `club_rewards`, `club_collect_requests`, and `user_private_settings`.
- Tenant tables have RLS enabled with direct browser access revoked. All reads and mutations run through `club-api`, which validates the opaque Passport session and repeats membership/role checks server-side. `club-api` has gateway JWT verification disabled only because it performs this custom authentication itself.
- A user may create or join multiple independent clubs and switch the active club from Settings. Club join codes are random 128-bit values; only SHA-256 hashes are stored. Rotating an invite invalidates the previous code.
- Clubs can have any number of active signed-in players. New guest-player creation and player pause/reactivate controls are intentionally **not exposed in Settings**; the normal model is one Second Life username account per player. Legacy guest/inactive rows may remain in stored data for compatibility.
- When a new adventure starts, **all active club players are snapshotted as participants**, so later roster changes do not rewrite who was part of that adventure.
- In club mode, the Adventures header keeps the existing visual hierarchy and dynamically renders one compact tab per player. **Any one snapshotted participant reaching all three stamps completes the adventure.** Members may mark their own stamps when manual tracking is needed.
- Pre-cutover board/account rows remain stored as an archive, but they are not reachable from normal navigation and have no claim/migration UI. New play starts with a fresh SL-username account and club.
- Adventure Treasure is configured per club and defaults OFF for newly created clubs. Reward/payout logs stay club-scoped.
- Treasure payer and recipient must always be different players. Treasure roles are unclaimed while OFF. Settings uses a simple **Treasure checkbox**: the first active member who checks it becomes the locked **Payer**; only that payer may uncheck it, choose **Paid to**, and record **Mark 1,000 L$ as paid**. The payment button stays visible to the payer while Treasure is ON and remains disabled until at least 1,000 L$ is due. Another player can take over only after the current payer unchecks Treasure. No automatic L$ debit exists.
- **Adventure Treasure is a separate top-level Settings card**, not nested inside the Clubs card. It always reflects the currently selected club and hides when no club is selected.
- The Clubs card uses a two-column layout on desktop: club picker/create/join/actions on the left, and a compact **scrollable Members panel** on the right showing active member display name + role. On narrow screens the Members panel stacks below.
- `admin.html` is retired and redirects to Settings. StaFi testing and Treasure/payment controls live in Settings.
- Settings must make unverified StaFi obvious: saved-but-unverified URLs show **StaFi needs test** and a visible amber status box; successful sync shows **StaFi connected** with last success and live collected/available totals; errors show a visible failure state. The primary action is **Test & enable StaFi**.
- Per-user StaFi validation and conservative current-adventure importing are live in `club-api`. Players save their private StaFi URL and use **Test & enable StaFi** once.
- Supabase cron job **bbb-stafi-refresh** calls `club-api` every **2 minutes** using a server-only secret. The Adventures page writes a lightweight play heartbeat about every 2 minutes while visible; cron only considers clubs with a current active adventure and a heartbeat within the last **10 minutes**. Stale/inactive clubs generate zero StaFi page fetches.
- While Adventures is open, the browser also attempts StaFi refresh about once per minute, immediately after opening, and when returning to the tab.
- The StaFi parser reads the page summary (**collected / uncollected / all currently available**). Collected count remains per player; **all currently available stamps is a single global app value** in `app_runtime_state`, refreshed from successful StaFi checks. Raw StaFi URLs remain private.
- Only confidently identified stamps from the board's **current active adventure** are imported. Starting a different adventure retires the prior active run so two adventures cannot compete for StaFi imports. Manual **Mark stamp** remains available.
- Version-controlled backend sources live under `supabase/migrations/` and `supabase/functions/club-api/`.
