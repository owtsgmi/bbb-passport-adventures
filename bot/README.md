# Passport Adventures — Second Life Messenger

This optional backend bot sends a real Second Life IM to the payer/admin when an Adventure Treasure payout is due.

## Player experience

None. Normal users do not rez prims, paste scripts, wear HUDs, or configure anything in-world.

## Admin requirements

1. Create or choose a dedicated Second Life avatar for the bot.
2. Mark that account as a **Scripted Agent** in Second Life account settings.
3. In Passport Adventures **Admin**, generate a one-time bot setup key.
4. On the VPS, clone/update this repository and run:

```bash
sudo bash bot/install.sh
```

The installer asks for the bot's SL username, password, and the setup key.

Credentials are stored only in `/etc/passport-messenger.env` on the VPS with mode 600. They are never committed to GitHub or stored in browser JavaScript.

## Runtime flow

- The service logs the dedicated bot avatar into Second Life using LibreMetaverse.
- It polls Passport Adventures for queued IMs.
- A payout IM is sent to the first/player-one SL account telling them who to pay and how much.
- Test IMs use the same path but are clearly labeled **TEST ONLY**.
- The queue is acknowledged after the bot attempts to send the IM.

## Operations

```bash
systemctl status passport-messenger --no-pager
journalctl -u passport-messenger -f
systemctl restart passport-messenger
```
