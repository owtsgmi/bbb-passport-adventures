// OBSOLETE - DO NOT USE
//
// Passport Adventures no longer automates Linden-dollar transfers.
// The current design uses passport-reminder.lsl, which only sends an
// in-world IM when a 1,000 L$ manual payment is due.
//
// This file is intentionally disabled so an older link or cached copy of
// the setup page cannot accidentally lead to a debit-enabled script.

default
{
    state_entry()
    {
        llOwnerSay("This old Passport Bank script is disabled. Use passport-reminder.lsl instead.");
    }

    touch_start(integer total_number)
    {
        if (llDetectedKey(0) == llGetOwner())
            llOwnerSay("No payment functions are enabled here. Use the Passport Pay Reminder script.");
    }
}
