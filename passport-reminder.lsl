// Passport Pay Reminder
// SAFE: this script NEVER requests debit permission and NEVER transfers L$.
// It only checks the Passport Adventures reward balance and IMs the object's owner.

string REMINDER_URL = "https://tzxlrglgwzinefutledx.supabase.co/functions/v1/passport-bank";
string LAST_READY_KEY = "bbb_reminder_last_ready";
string LAST_SOURCE_KEY = "bbb_reminder_last_source";

key reqStatus = NULL_KEY;
integer lastReady = -1;
string lastSource = "";
integer firstCheck = TRUE;

list httpParams()
{
    return [HTTP_METHOD, "POST", HTTP_MIMETYPE, "application/json"];
}

checkNow()
{
    if (reqStatus != NULL_KEY) return;

    reqStatus = llHTTPRequest(
        REMINDER_URL,
        httpParams(),
        llList2Json(JSON_OBJECT, ["action", "status"])
    );
}

sendReminder(integer ready, integer balance, string payer, string recipient, string source)
{
    string prefix = "Passport Adventures";
    if (source == "test")
        prefix += " TEST";

    string plural = "";
    if (ready != 1) plural = "s";

    string msg = prefix + ": " + recipient + " has "
        + (string)balance + " L$ ready toward payout. "
        + (string)ready + " payment" + plural + " of L$1000 "
        + ((ready == 1) ? "is" : "are") + " available. "
        + "Pay " + recipient + " manually in Second Life, then use "
        + ""Mark 1,000 L$ paid" on the Passport Adventures website.";

    llInstantMessage(llGetOwner(), msg);
}

default
{
    state_entry()
    {
        lastReady = (integer)llLinksetDataRead(LAST_READY_KEY);
        lastSource = llLinksetDataRead(LAST_SOURCE_KEY);

        llSetTimerEvent(60.0);
        llOwnerSay("Passport Pay Reminder is running. It checks once per minute and only sends IM reminders; it cannot move L$.");
        checkNow();
    }

    on_rez(integer start_param)
    {
        llResetScript();
    }

    changed(integer change)
    {
        if (change & CHANGED_OWNER)
        {
            llLinksetDataWrite(LAST_READY_KEY, "");
            llLinksetDataWrite(LAST_SOURCE_KEY, "");
            llResetScript();
        }
    }

    touch_start(integer total_number)
    {
        if (llDetectedKey(0) != llGetOwner()) return;

        llOwnerSay("Checking Passport Adventures payout balance now...");
        firstCheck = TRUE;
        checkNow();
    }

    timer()
    {
        checkNow();
    }

    http_response(key request_id, integer status, list metadata, string body)
    {
        if (request_id != reqStatus) return;
        reqStatus = NULL_KEY;

        if (status < 200 || status >= 300)
        {
            llOwnerSay("Passport reminder could not reach the website. It will retry automatically.");
            return;
        }

        if (llJsonGetValue(body, ["ok"]) != "true")
            return;

        integer ready = (integer)llJsonGetValue(body, ["ready_payments"]);
        integer balance = (integer)llJsonGetValue(body, ["effective_balance"]);
        string source = llJsonGetValue(body, ["source"]);
        string payer = llJsonGetValue(body, ["payer_username"]);
        string recipient = llJsonGetValue(body, ["recipient_username"]);

        if (payer == JSON_NULL || payer == "") payer = "payer";
        if (recipient == JSON_NULL || recipient == "") recipient = "benefactor";

        if (ready > 0)
        {
            if (firstCheck || ready != lastReady || source != lastSource)
                sendReminder(ready, balance, payer, recipient, source);
        }

        lastReady = ready;
        lastSource = source;
        firstCheck = FALSE;

        llLinksetDataWrite(LAST_READY_KEY, (string)lastReady);
        llLinksetDataWrite(LAST_SOURCE_KEY, lastSource);
    }
}
