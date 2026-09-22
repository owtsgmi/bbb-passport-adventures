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
- Player-facing header should stay intentionally simple:
  - title: **Bellisseria Passport Adventures**;
  - short subtitle: **Pick a 3-stop adventure, collect BBB stamps together, and explore Second Life.**
  - keep the top header free of action buttons;
  - **Settings** lives in the hamburger menu, not beside the passport counter;
  - keep a prominent top-right passport completion counter for the selected player, e.g. **1 / 382**, with the remaining stamp count below it. This is the primary game goal and should remain visually prominent;
  - no cloud-sync text, StaFi-link count, payout status, notification diagnostics, or other technical/admin status in the header.
- Random selection button text: **Pick Random Adventure**. It appears only inside the expanded **Choose Another Adventure** section.
- The random button must be visually obvious at the top of the expanded chooser, above the pending adventure cards.
- Keep adventure stop lists clean: do **not** render the old `missionSetup` Travel / Next stop / Copy destination strip above stop rows. Per-stop Copy buttons are enough.
- Current adventure loads collapsed.
- Adult-playful purple/pink/gold style with subtle alien graphics.
- Settings is a standalone page at `settings.html`, linked from the hamburger menu on Adventures and supporting pages.
- Do not reintroduce the inline Settings panel on `index.html`; the main Adventures page should remain focused on gameplay.
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
- **Hamburger source of truth:** match the working `feedback.html` Comments page navigation pattern on every page. Use the same 46px menu button, absolute left-gutter placement on wide screens, 230px dropdown, and the same narrow-screen fallback. Do not invent page-specific hamburger layouts.
- `index.html`, `settings.html`, `instructions.html`, `bbb.html`, and `admin.html` were normalized to that Comments-page pattern.
- Main title art now uses a real passport-cover photograph rather than the custom drawn passport icon. Current source is a public-domain U.S. Department of State passport-cover image served from Wikimedia Commons, with `passport-icon.svg` as the fallback if the remote image fails.
- Desktop navigation hamburger is an icon-only **☰** in the left gutter, vertically aligned with the page title/alien line rather than sitting on its own row.
- At narrower browser widths the hamburger must move inside the header grid rather than remain in the left gutter, so it is never clipped off-screen.
- Important CSS caution: responsive `.navwrap` overrides must appear after the base `.navwrap` rule, otherwise the base absolute positioning wins and clips the hamburger again.
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
- The optional reward feature is named **Adventure Treasure** (do not call it benefactor mode).
- `bbb_board_state.adventure_treasure_enabled` controls whether the player-facing treasure experience is visible. Default is **false/off**.
- When Adventure Treasure is off, hide the treasure balance, mystery-L$ labels, completed-adventure reward amounts, and the L$ scorecard chip. Existing reward/accounting data is preserved rather than deleted.
- `payout-push` must pause real threshold notifications while Adventure Treasure is off. Admin test notifications may still be used for setup/diagnostics.
- Admin toggles Adventure Treasure through authenticated `set_treasure_mode` on the `payout-push` Edge Function.
- Adventure Treasure should stay visually secondary to passport completion:
  - render it as a compact row directly under the prominent top-right passport counter;
  - show the current L$ total in the collapsed summary;
  - put milestone progress, lifetime prize total, waiting status, and recent prizes behind an on-demand details disclosure;
  - do not use a full-width reward section in the main page flow.
- On the second-player/benefactor view, once unpaid Adventure Treasure is at least **1,000 L$**, the expanded Treasure details show **🎉 Get Your 1,000 L$ Bonus** with friendly copy such as **Good job — you earned it!**
- Do not frame this as the benefactor asking the payer for money. The UI should feel celebratory and automatic. Behind the scenes, the bonus button requests exactly one 1,000 L$ payout; it never transfers L$ itself.
- `payout-push` action `request_collect` validates Treasure is enabled and the real unpaid balance is at least 1,000 L$, then notifies the payer through configured browser push and queues a real SL IM when the backend bot is available. Payer-facing notification text should say the benefactor **earned/is ready for their 1,000 L$ bonus**, not that they are asking for payment.
- Duplicate requests at the exact same unpaid balance are deduped using `bbb_push_config.last_collect_request_balance`; after the payer records a payment and the balance changes, the benefactor may request the next 1,000 L$ chunk.
- Admin shows a visible note when the current balance has an active benefactor Collect Rewards request.
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
  - an admin-only **Test payout simulation** section with **Add 1,000 L$ test money**, **Clear test money**, and **Send test payout alert**;
  - test money is stored separately in `bbb_push_config.test_balance` and must never alter `payout_log`, adventure completion, the real benefactor balance, or actual L$;
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
- `payout-push` Edge Function version 9 includes authenticated `mark_paid`, authenticated `set_treasure_mode`, authenticated `set_test_balance`, backend bot token management, SL IM queue polling/acknowledgement, test-SL-IM queueing, and the server-validated player-facing `request_collect` action. Admin-only actions still use the current device's push subscription control token. It allocates exactly 1,000 L$ across payout-log rows, returns the remaining balance, pauses real threshold notifications while Adventure Treasure is off, and routes payout/test notifications to `admin.html` rather than the player-facing Adventures page.
- Browser payout alerts use standard Web Push:
  - service worker: `sw.js`;
  - Edge Function: `payout-push`;
  - subscriptions are stored server-side;
  - the payer/admin device opts in once.
- The background `bbb-payout-push-check` cron job runs every five minutes, and the Adventures page also calls `check` after successful shared-state writes.
- Alert delivery is intentionally admin-only. The benefactor does not need to configure or understand notifications.
- Alerts appear as **desktop/system notifications**, not inside the Passport Adventures browser tab.
- Admin setup must state clearly that the browser must allow **Notifications** for the site. The optional Firestorm Pay shortcut may also require allowing a **pop-up / external-app launch prompt** when the browser asks.
- Admin diagnostics order:
  - **Test local popup** verifies browser/OS display;
  - **Test server push** verifies the full Supabase/Web Push path.
- Optional Pay shortcut:
  - Linden Lab's Name-to-Agent-ID API resolves the saved benefactor username to an avatar UUID;
  - the Linden API key is accepted transiently for that lookup and is not stored;
  - once resolved, Admin can open `secondlife:///app/agent/<uuid>/pay`.
- Old LSL reminder/payment scripts remain harmless obsolete stubs; no current workflow requires LSL.


## Immediate next work
1. **Bring the self-hosted Second Life IM messenger online**
   - create or choose a dedicated SL bot avatar;
   - mark that account as a Scripted Agent;
   - resolve both player UUIDs from Admin if the payer UUID is still missing;
   - generate a bot setup key in Admin;
   - clone/update the repo on the VPS and run `sudo bash bot/install.sh`;
   - confirm Admin shows the bot as Connected;
   - add 1,000 L$ test money and use **Send test SL IM**;
   - verify a real IM appears in Firestorm for the payer.
2. **Finish and test the optional Second Life Pay shortcut**
   - obtain a Linden Lab API key;
   - resolve the saved second-player/benefactor username to avatar UUID;
   - confirm **Pay in Second Life** launches Firestorm;
   - confirm Firestorm opens the correct avatar's Pay dialog;
   - browser may require permission to open an external application.
3. **Run a full Adventure Treasure payout simulation**
   - turn Adventure Treasure ON from Admin;
   - use Admin **Add 1,000 L$ test money** to create a separate simulation balance without touching permanent adventure/reward history;
   - verify the admin/payer device receives the desktop payout notification;
   - clicking the notification should open `admin.html`;
   - verify the 1,000 L$ payment-ready box;
   - test **Mark 1,000 L$ paid** and confirm the remainder is correct.
4. **Re-check player experience with the feature switch**
   - OFF: no L$ score chip, no treasure panel, no Mystery L$ labels, no completed reward amounts;
   - ON: benefactor sees friendly Adventure Treasure only;
   - player pages never expose notification/API/payment bookkeeping controls.
5. **Test the admin notification flow on Windows**
   - browser site Notifications permission;
   - Windows toast / Notification Center;
   - notification click opens Admin;
   - Firestorm external-app launch.
6. **Automatic BBB StaFi sync remains the major gameplay integration**
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
- Site branding remains unicorn-free. The main app title is **Bellisseria Passport Adventures** (official spelling: Bellisseria). Use a realistic passport-cover image for the main title; `passport-icon.svg` is only the fallback. The browser-tab favicon may remain the alien favicon unless explicitly changed.
- Adventure Treasure defaults **OFF**.
- Keep setup and payment mechanics on `admin.html`, out of the player experience.
- Keep the top of `index.html` clean and game-oriented. Technical connection/sync/StaFi status belongs off the main header; Admin is the home for operational setup and diagnostics.
- Settings should use neutral **first player / second player** language. Do not label the second player as “benefactor” in general Settings.
- The player page should not advertise L$ rewards in its subtitle because Adventure Treasure may be OFF.
- The benefactor should see a fun accumulation of money they are going to receive, not operational payout language.
- Browser payout alerts are desktop/system notifications, not notifications inside the browser tab.
- The realistic test payout notification must explicitly say which saved Second Life username should be paid.
- **There is no in-world Second Life IM sender in the current no-script/no-bot architecture.** The old LSL reminder path was retired and SmartBots was rejected on recurring cost. Current testing covers desktop/system push + Admin + optional Firestorm Pay handoff. If actual in-world IMs are requested again, that is a deliberate architecture change requiring a sender (LSL object or bot/service).
- **Hard UX constraint:** do not require users to rez prims, paste LSL, wear HUDs, or manage scripts for payout notifications. The user explicitly rejected any prim/script setup. If in-world IM delivery is revisited, it must be completely backend-managed with zero in-world setup for normal users; otherwise keep the existing desktop/system notification flow.
- True in-world IM delivery is now being implemented via a **self-hosted LibreMetaverse scripted-agent bot on the VPS**. Normal users do nothing in-world. The dedicated bot avatar must be marked as a Scripted Agent in Second Life account settings.
- Bot source lives under `bot/` in this repo: `PassportMessenger.csproj`, `Program.cs`, `install.sh`, `passport-messenger.service`, and `README.md`.
- Bot credentials are stored only on the VPS in `/etc/passport-messenger.env` with mode 600; never put the SL bot password or bot setup token in GitHub or client-side JavaScript.
- Backend queue table: `bbb_sl_im_queue`. The bot polls `payout-push` using an admin-generated one-time setup token whose SHA-256 hash is stored in `bbb_push_config.bot_token_hash`.
- `bbb_push_config` also tracks `payer_uuid`, `bot_last_seen_at`, and `bot_account_name`. Admin status treats the bot as connected when it has checked in recently.
- Real payout IM format should be simple and explicit, e.g. `Passport Adventures: kististulip has earned 1,000 L$. Please pay kististulip 1,000 L$.` Test messages must be clearly labeled TEST ONLY.
- Admin setup must clearly say the site needs browser **Notifications** permission; optional Firestorm launching may need an external-app/pop-up permission prompt.
