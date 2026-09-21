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
- Current dataset: **381 stamps = 127 adventures**.
- A run only counts when **both players have all 3 stamps**.
- One player completing the three stamps alone is only "waiting on the other" and earns no payout yet.
- Each jointly completed 3-stop adventure reveals one **random 20–100 L$ mystery reward**.
- The reward recipient is the **second/player-two SL username** (👽 tab), while the **first/player-one SL username** (🗡️ tab) is the sponsor/payer.
- The L$ amount stays hidden until both players complete all 3 stops. A completed adventure gets one persisted random reward in `bbb_board_state.adventure_rewards`; reopening or switching devices must not reroll it.
- Reward ownership does not change when switching tabs.
- Both tabs show passport progress. Reward ownership stays with the second SL username; revealed prizes accumulate toward the next fixed 1,000 L$ payout.

## UI
- Two configurable player tabs use the players' **actual Second Life usernames** as their labels.
- Button text: **Pick an Adventure**.
- Current adventure loads collapsed.
- Adult-playful purple/pink/gold style with subtle alien graphics.
- Settings page allows:
  - payer and recipient Second Life usernames (also used as the tab names)
  - each person's BBB StaFi progress-page URL
  - default tab
  - Secret Club Code

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
- The top stamp counter should show the **full passport total**, not only the 381-stamp campaign subset.
- Current snapshot total: **382 stamps** = 381 campaign/uncollected stamps + 1 known pre-campaign stamp. Do not hardcode or publish the private StaFi reference used to establish that baseline.
- Display format should include both collected/total and remaining, e.g. **1/382 stamps · 381 to go**.
- Adventure rewards still use only the 381 campaign stamps grouped into 127 three-stop runs.


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


## Public multi-user roadmap
- Goal: evolve from the current private two-player prototype into a low-friction public multi-user app without losing the simple adventure experience.
- Phase 1 — Identity:
  - Add Supabase Auth using magic link / email OTP rather than traditional passwords.
  - Add a `profiles` table keyed by `auth.users.id` with display name and optional SL name.
- Phase 2 — Clubs/groups:
  - Add `clubs` and `club_members` tables.
  - A user can create or join multiple clubs.
  - Invite via short join code or invite link; do not use the current Secret Club Code as long-term identity/auth.
  - Roles: owner/admin/member.
- Phase 3 — Scope game state:
  - Replace the single global `bbb_board_state` row with club-scoped state.
  - Adventure starts, current adventure, completion history, reward rules, payout history, and settings belong to a club.
- Phase 4 — Per-user passport progress:
  - Add normalized `user_stamp_progress` keyed by user + stamp.
  - Each user's StaFi URL remains private to that user; only derived progress is shared with clubs as needed.
  - Never expose raw StaFi reference URLs to other members.
- Phase 5 — Authorization:
  - Use RLS for all user/club tables.
  - Users can access only their own profile/private settings and clubs where they are members.
  - Club owner/admin capabilities should be explicit permissions, not possession of a shared secret.
- Phase 6 — Realtime:
  - Subscribe to club-scoped state so stamp/adventure changes appear immediately on other members' devices.
- Phase 7 — Generalize rewards:
  - Replace AA/KK-specific reward ownership with configurable club rules: earner(s), sponsor(s), reward amount, required participants, and payout model.
- Phase 8 — Migration:
  - Convert the current AA/KK installation into the first club and preserve existing completed adventures, current adventure, revealed reward values, and payout history.
- Phase 9 — Public hardening:
  - Add rate limits/abuse controls to feedback, invitations, and other write endpoints.
  - Replace temporary feedback Owner Passphrase with authenticated owner/admin roles when public launch happens.
  - Keep the BBB public catalog global/read-only while private gameplay remains user/club scoped.


## Shared Second Life map component
- Reusable map code lives in `slmap.js`.
- It uses Linden Lab's documented map tile pyramid: zoom level 1 is region detail and level 8 is the broadest/world view.
- The map renders a 5×5 tile neighborhood around the current center, supports drag/pan, wheel/buttons for zoom, **Fit**, and **World**.
- BBB Stops page uses this map for the selected stop and gives it substantial vertical space.
- The Adventures page places a map at the bottom of the current adventure and marks all 3 stops (1, 2, 3); Fit frames the route and World provides broad SL context.
- Region names are translated to grid coordinates through Linden Lab's public region-coordinate capability.
- Do not revert to embedding the maps.secondlife.com SLURL page in an iframe; that approach produced blank embeds.

## Mystery L$ reward model
- There is **no secondary points/currency system**. Unicorn Bucks have been removed from the app because they added an unnecessary extra layer.
- Each jointly completed adventure reveals one random Linden reward from **20 through 100 L$ inclusive**.
- Never show the specific L$ amount before both passports complete the adventure.
- On first joint completion, generate the value once and persist it in `bbb_board_state.adventure_rewards`, keyed by adventure ID.
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
- **NEXT** means the first stop not yet recorded complete for **both** players.
- It advances from the shared `meDone` / `partnerDone` stamp state, not from map selection.
- The intended final behavior is: BBB passport accepts a stamp → StaFi sync imports that accepted stamp → shared progress updates → NEXT advances automatically when both players have that stop.
- Automatic StaFi stamp importing is **not yet fully connected/tested**, so do not tell users that merely accepting a stamp in Second Life currently advances NEXT by itself.


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
- Desktop navigation hamburger is an icon-only **☰** in the left gutter, vertically aligned with the page title/unicorn line rather than sitting on its own row.
- On narrow/mobile screens the hamburger falls back into normal flow above the title so it remains reachable.
- First/player-one tab icon: **🗡️**.
- Second/player-two tab icon: **👽**.
- Use these same icons for the matching Settings labels and StaFi fields.


## Current adventure protection
- The active Current Adventure is **locked by default**.
- Shared lock state is stored in `bbb_board_state.adventure_locked` and synchronized across devices.
- While locked, both **Pick an Adventure** and lower **Make this our adventure** actions must refuse to replace the current incomplete adventure.
- The Current Adventure summary contains an **Adventure locked** checkbox so switching requires an intentional unlock.
- Even after unlocking, switching to a different adventure requires an **Are you sure?** confirmation.
- Existing stamp progress in the old adventure is preserved if the user intentionally switches.
- Every newly selected adventure automatically re-locks itself.
- If there is no active incomplete adventure, the lock control is hidden/disabled and choosing an adventure works normally.


## Player reward experience + admin payout workflow
- The **player-facing Adventures page must not show payout-alert setup, notification diagnostics, API-key forms, Pay-link setup, or manual-payment bookkeeping**.
- The benefactor/second-player view should feel like a game reward screen:
  - friendly **Adventure Treasure** wording;
  - current L$ waiting for them;
  - lifetime adventure-prize total;
  - recent prize list;
  - progress toward the next **1,000 L$ milestone**.
- The first-player view may show the same treasure pot for context, but should remain non-technical and contain no payout/admin controls.
- Settings uses neutral player wording:
  - first SL username;
  - benefactor SL username;
  - a generic **Admin** link.
- Unified admin page: `admin.html`.
- Legacy `bank.html` and `payout-admin.html` redirect to `admin.html`.
- Admin page contains the complete setup checklist:
  1. save both actual SL usernames;
  2. enable payout alerts on the payer/admin device;
  3. send one test notification and confirm the desktop/system popup;
  4. optional one-click Second Life Pay-link setup.
- Admin page also shows:
  - benefactor username;
  - current unpaid reward balance;
  - how many fixed 1,000 L$ payments are ready;
  - optional Second Life Pay link;
  - **Mark 1,000 L$ paid** bookkeeping action;
  - local/server notification diagnostics.
- Adventure rewards still reveal random **20–100 L$** values and accumulate in the second/player-two benefactor's unpaid balance.
- Payment threshold and unit remain **1,000 L$**.
- No automatic L$ transfer is performed by the app.
- Real payment is made manually in Second Life; after sending it, the admin records exactly one 1,000 L$ payment.
- `payout-push` Edge Function version 3 includes authenticated `mark_paid`, using the current device's push subscription control token. It allocates exactly 1,000 L$ across payout-log rows and returns the remaining balance. Payout/test notifications now open `admin.html`, not the player-facing Adventures page.
- Browser payout alerts use standard Web Push:
  - service worker: `sw.js`;
  - Edge Function: `payout-push`;
  - subscriptions are stored server-side;
  - the payer/admin device opts in once.
- The background `bbb-payout-push-check` cron job runs every five minutes, and the Adventures page also calls `check` after successful shared-state writes.
- Alert delivery is intentionally admin-only. The benefactor does not need to configure or understand notifications.
- Alerts appear as **desktop/system notifications**, not inside the Passport Adventures browser tab.
- Admin diagnostics order:
  - **Test local popup** verifies browser/OS display;
  - **Test server push** verifies the full Supabase/Web Push path.
- Optional Pay shortcut:
  - Linden Lab's Name-to-Agent-ID API resolves the saved benefactor username to an avatar UUID;
  - the Linden API key is accepted transiently for that lookup and is not stored;
  - once resolved, Admin can open `secondlife:///app/agent/<uuid>/pay`.
- Old LSL reminder/payment scripts remain harmless obsolete stubs; no current workflow requires LSL.
