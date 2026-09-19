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
