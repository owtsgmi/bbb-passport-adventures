// Passport Bank - TEST MODE ONLY
// This version NEVER requests PERMISSION_DEBIT and NEVER transfers L$.
// It exercises the real website -> Supabase -> Second Life object -> owner approval -> result path.

string BANK_URL = "https://tzxlrglgwzinefutledx.supabase.co/functions/v1/passport-bank";
string TOKEN_KEY = "bbb_passport_bank_token";

string bankToken = "";
key reqRegister = NULL_KEY;
key reqPoll = NULL_KEY;
key reqResult = NULL_KEY;

string currentRequest = "";
integer currentAmount = 0;
integer dialogChannel = 0;
integer dialogHandle = 0;

integer newChannel()
{
    return -1000000 - (integer)llFrand(1000000000.0);
}

list httpParams(integer withToken)
{
    list p = [HTTP_METHOD, "POST", HTTP_MIMETYPE, "application/json"];
    if (withToken && bankToken != "")
        p += [HTTP_CUSTOM_HEADER, "x-passport-bank-token", bankToken];
    return p;
}

registerObject()
{
    llOwnerSay("Requesting a TEST-MODE pairing code...");
    reqRegister = llHTTPRequest(
        BANK_URL,
        httpParams(FALSE),
        llList2Json(JSON_OBJECT, ["action", "object_register"])
    );
}

pollBank()
{
    if (bankToken == "") return;
    if (reqPoll != NULL_KEY) return;
    reqPoll = llHTTPRequest(
        BANK_URL,
        httpParams(TRUE),
        llList2Json(JSON_OBJECT, ["action", "poll"])
    );
}

sendResult(string action)
{
    if (currentRequest == "") return;
    reqResult = llHTTPRequest(
        BANK_URL,
        httpParams(TRUE),
        llList2Json(JSON_OBJECT, [
            "action", action,
            "request_id", currentRequest
        ])
    );
}

showApproval(string requestId, integer amount)
{
    currentRequest = requestId;
    currentAmount = amount;

    if (dialogHandle) llListenRemove(dialogHandle);
    dialogChannel = newChannel();
    dialogHandle = llListen(dialogChannel, "", llGetOwner(), "");

    llDialog(
        llGetOwner(),
        "PASSPORT BANK - TEST MODE\n\n"
        + "Simulate paying KK L$" + (string)amount + "?\n\n"
        + "NO LINDEN DOLLARS WILL MOVE.\n"
        + "This tests the full communication and approval path.",
        ["Approve Test", "Reject"],
        dialogChannel
    );
}

default
{
    state_entry()
    {
        bankToken = llLinksetDataRead(TOKEN_KEY);
        llSetTimerEvent(8.0);

        if (bankToken == "")
            llOwnerSay("Passport Bank TEST object ready. Touch it to begin pairing.");
        else
            llOwnerSay("Passport Bank TEST object restarted. Saved pairing token loaded.");
    }

    on_rez(integer start_param)
    {
        llResetScript();
    }

    changed(integer change)
    {
        if (change & CHANGED_OWNER)
        {
            llLinksetDataWrite(TOKEN_KEY, "");
            llResetScript();
        }
    }

    touch_start(integer total_number)
    {
        if (llDetectedKey(0) != llGetOwner()) return;

        if (bankToken == "")
            registerObject();
        else
        {
            llOwnerSay("Passport Bank TEST object is running. Checking for a pending test payment now.");
            pollBank();
        }
    }

    timer()
    {
        pollBank();
    }

    listen(integer channel, string name, key id, string message)
    {
        if (id != llGetOwner()) return;

        if (message == "Approve Test")
        {
            llOwnerSay("Approving TEST payment of L$" + (string)currentAmount + ". No L$ will move.");
            sendResult("test_success");
        }
        else if (message == "Reject")
        {
            llOwnerSay("Rejecting test payment.");
            sendResult("reject");
        }

        if (dialogHandle)
        {
            llListenRemove(dialogHandle);
            dialogHandle = 0;
        }
    }

    http_response(key request_id, integer status, list metadata, string body)
    {
        if (request_id == reqRegister)
        {
            reqRegister = NULL_KEY;

            if (status < 200 || status >= 300)
            {
                llOwnerSay("Pairing request failed: HTTP " + (string)status);
                return;
            }

            if (llJsonGetValue(body, ["ok"]) != "true")
            {
                llOwnerSay("Pairing request was not accepted: " + llJsonGetValue(body, ["error"]));
                return;
            }

            string code = llJsonGetValue(body, ["code"]);
            bankToken = llJsonGetValue(body, ["token"]);

            if (bankToken == "" || bankToken == JSON_INVALID)
            {
                llOwnerSay("Pairing response did not include a token.");
                bankToken = "";
                return;
            }

            llLinksetDataWrite(TOKEN_KEY, bankToken);
            llOwnerSay("PAIRING CODE: " + code);
            llOwnerSay("Enter this 8-digit code on the Passport Adventures website. It expires in 10 minutes.");
            return;
        }

        if (request_id == reqPoll)
        {
            reqPoll = NULL_KEY;

            if (status == 403)
                return;

            if (status < 200 || status >= 300)
            {
                llOwnerSay("Bank poll failed: HTTP " + (string)status);
                return;
            }

            if (llJsonGetValue(body, ["ok"]) != "true")
                return;

            string pending = llJsonGetValue(body, ["pending"]);
            if (pending == JSON_NULL || pending == "" || pending == JSON_INVALID)
                return;

            string requestId = llJsonGetValue(body, ["pending", "id"]);
            integer amount = (integer)llJsonGetValue(body, ["pending", "amount"]);

            if (requestId != "" && requestId != JSON_INVALID && requestId != currentRequest)
                showApproval(requestId, amount);

            return;
        }

        if (request_id == reqResult)
        {
            reqResult = NULL_KEY;

            if (status >= 200 && status < 300 && llJsonGetValue(body, ["ok"]) == "true")
            {
                string result = llJsonGetValue(body, ["status"]);
                if (result == "test_success")
                    llOwnerSay("TEST SUCCESS. The full payout path worked and no L$ moved.");
                else
                    llOwnerSay("Test request closed: " + result);

                currentRequest = "";
                currentAmount = 0;
            }
            else
            {
                llOwnerSay("Could not report the test result. HTTP " + (string)status);
            }
        }
    }
}
