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
- Each jointly completed 3-stop adventure earns **500 Unicorn Bucks = 51 L$**.
- The reward recipient is **KK** (the second/player-two tab), while **AA** is the sponsor/payer.
- Reward ownership does not change when switching tabs.
- Both tabs show passport progress, but the Unicorn Bucks balance/top score/reward bank must always be labeled for the reward recipient (KK).

## UI
- Two configurable player tabs; current intended labels are **AA** and **KK**.
- Button text: **Pick an Adventure**.
- Current run loads collapsed.
- Adult-playful purple/pink/gold style with subtle alien graphics.
- Settings page allows:
  - player/tab names
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
- Adventure progress, current run, Unicorn Bucks redemption, and payout history are persisted in Supabase.

## Important implementation cautions
- Do not claim BBB automatic stamp sync is working until the StaFi parser/sync has actually been connected and tested.
- Current StaFi links can be saved/encrypted, but automatic parsing of BBB progress is a separate feature.
- When changing wording, do not blindly global-replace strings that can alter JavaScript function names.
- After edits, inspect the updated source for syntax damage before telling the user it is fixed.
- Preserve the user's personal/fun design now; generalize for other couples/friends only later if requested.


## Total passport counter
- The top stamp counter should show the **full passport total**, not only the 381-stamp campaign subset.
- Current snapshot total: **382 stamps** = 381 campaign/uncollected stamps + 1 pre-campaign stamp already collected by the user's StaFi page Ref=50970.
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


## Feedback curation security
- Public users may submit and read visible feedback, but cannot directly update/delete rows.
- Owner curation is protected by a separate **Curator Code** that is intentionally different from the shared Secret Club Code.
- Only a salted SHA-256 hash of the Curator Code is stored in the non-public `app_feedback_admin` table.
- The raw Curator Code is never committed to GitHub or stored in Supabase.
- Curator mode is unlocked through security-definer RPCs:
  - `feedback_admin_check`
  - `feedback_admin_list`
  - `curate_feedback`
- Curator can edit message text, mark resolved/open, hide/unhide, or permanently delete entries.
- Hidden feedback is excluded from normal public reads but remains visible in curator mode.
- The browser remembers curator unlock only in `sessionStorage` for the current tab/session.
- Do not use the shared two-player Secret Club Code as the feedback Curator Code.


## Owner-only feedback curation
- Public users can submit and read visible feedback, but cannot update or delete it directly.
- Public insert is column-limited to display name, type, message, and page/area. New public submissions are forced to status `open`, not pinned, and not hidden.
- Owner moderation uses the `feedback-admin` Supabase Edge Function.
- Owner actions available: edit, change status (`open/planned/fixed/closed`), pin/unpin, hide/unhide, and permanent delete.
- The feedback page exposes an **Owner tools** panel. The Owner Code is stored only in browser `sessionStorage` after unlock and clears when that browser session ends or the user presses Lock.
- The Owner Code is **separate from the Secret Club Code** used by the two-player game.
- Only a SHA-256 hash of the Owner Code is stored in `public.feedback_admin_config`; the plaintext Owner Code must never be committed to GitHub, displayed publicly, or placed in client JavaScript.
- `public.feedback_admin_config` has RLS enabled and no anon/authenticated grants. Backend admin access uses Supabase server credentials inside the Edge Function.
- If the Owner Code is ever exposed, rotate it by replacing the stored hash and giving the owner a new code.
