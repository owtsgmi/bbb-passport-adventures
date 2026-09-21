// Passport Bank - fixed 1000 L$ payouts
// The object MUST be owned by the payer avatar.
// It verifies the payer/recipient usernames configured on the website.
// Every transfer is exactly L$1000 and requires an owner approval dialog.

string BANK_URL = "https://tzxlrglgwzinefutledx.supabase.co/functions/v1/passport-bank";
string TOKEN_KEY = "bbb_passport_bank_token";
string INFLIGHT_KEY = "bbb_passport_bank_inflight";

string bankToken = "";

string payerUsername = "";
string recipientUsername = "";
key recipientKey = NULL_KEY;

string ownerResolved = "";
string recipientResolved = "";
key qOwnerName = NULL_KEY;
key qRecipientKey = NULL_KEY;
key qRecipientName = NULL_KEY;
integer verifying = FALSE;
integer identityVerified = FALSE;
integer debitReady = FALSE;

key reqRegister = NULL_KEY;
key reqPoll = NULL_KEY;
key reqVerify = NULL_KEY;
key reqDebit = NULL_KEY;
key reqResult = NULL_KEY;
key reqUnpair = NULL_KEY;

string currentRequest = "";
string currentSource = "";
integer currentAmount = 0;
key transferTxn = NULL_KEY;

integer dialogChannel = 0;
integer dialogHandle = 0;
string dialogMode = "";

string norm(string s)
{
    return llToLower(llStringTrim(s, STRING_TRIM));
}

list httpParams(integer withToken)
{
    list p = [HTTP_METHOD, "POST", HTTP_MIMETYPE, "application/json"];
    if (withToken && bankToken != "")
        p += [HTTP_CUSTOM_HEADER, "x-passport-bank-token", bankToken];
    return p;
}

integer newChannel()
{
    return -1000000 - (integer)llFrand(1000000000.0);
}

showMenu(list buttons, string text, string mode)
{
    if (dialogHandle) llListenRemove(dialogHandle);
    dialogChannel = newChannel();
    dialogHandle = llListen(dialogChannel, "", llGetOwner(), "");
    dialogMode = mode;
    llDialog(llGetOwner(), text, buttons, dialogChannel);
}

registerObject()
{
    llOwnerSay("Requesting a Passport Bank pairing code...");
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

beginVerification(string payer, string recipient)
{
    if (verifying) return;

    payerUsername = payer;
    recipientUsername = recipient;
    ownerResolved = "";
    recipientResolved = "";
    recipientKey = NULL_KEY;
    verifying = TRUE;

    llOwnerSay("Verifying payer " + payerUsername + " and recipient " + recipientUsername + "...");

    qOwnerName = llRequestUsername(llGetOwner());
    qRecipientKey = llRequestUserKey(recipientUsername);
}

tryFinishVerification()
{
    if (!verifying) return;
    if (ownerResolved == "") return;
    if (recipientKey == NULL_KEY) return;
    if (recipientResolved == "") return;

    if (norm(ownerResolved) != norm(payerUsername))
    {
        verifying = FALSE;
        llOwnerSay("PAYER MISMATCH: this object is owned by " + ownerResolved
            + ", but Settings says " + payerUsername + ". Fix Settings, then re-pair the bank.");
        return;
    }

    if (norm(recipientResolved) != norm(recipientUsername))
    {
        verifying = FALSE;
        llOwnerSay("RECIPIENT MISMATCH: Second Life resolved the recipient as "
            + recipientResolved + ", not " + recipientUsername + ". Fix Settings, then re-pair.");
        return;
    }

    reqVerify = llHTTPRequest(
        BANK_URL,
        httpParams(TRUE),
        llList2Json(JSON_OBJECT, [
            "action", "verify_identity",
            "owner_username", ownerResolved,
            "recipient_username", recipientResolved,
            "recipient_uuid", (string)recipientKey
        ])
    );
}

requestDebitPermission()
{
    llOwnerSay("Identity verified: " + payerUsername + " -> " + recipientUsername + ".");
    llOwnerSay("Second Life will now ask for debit permission. This script only sends L$1000 at a time to "
        + recipientUsername + ", and it still asks you to approve every payment.");
    llRequestPermissions(llGetOwner(), PERMISSION_DEBIT);
}

reportDebitReady(integer ready)
{
    reqDebit = llHTTPRequest(
        BANK_URL,
        httpParams(TRUE),
        llList2Json(JSON_OBJECT, [
            "action", "debit_ready",
            "ready", ready
        ])
    );
}

showPayment(string requestId, string sourceKind, integer amount, string recipient)
{
    if (amount != 1000) return;
    if ((string)recipientKey == "") return;

    currentRequest = requestId;
    currentSource = sourceKind;
    currentAmount = amount;

    string sourceText = "earned reward balance";
    if (sourceKind == "test_credit")
        sourceText = "TEST earnings (real L$ transfer)";

    showMenu(
        ["PAY 1000", "Cancel"],
        "PASSPORT BANK\n\n"
        + "Pay L$1000 from " + payerUsername + " to " + recipient + "?\n\n"
        + "Source: " + sourceText + "\n\n"
        + "THIS MOVES REAL LINDEN DOLLARS.",
        "payment"
    );
}

sendTransferResult(integer success, string data)
{
    if (currentRequest == "") return;

    reqResult = llHTTPRequest(
        BANK_URL,
        httpParams(TRUE),
        llList2Json(JSON_OBJECT, [
            "action", "transfer_result",
            "request_id", currentRequest,
            "transaction_id", (string)transferTxn,
            "success", success,
            "data", data
        ])
    );
}

requestUnpair()
{
    reqUnpair = llHTTPRequest(
        BANK_URL,
        httpParams(TRUE),
        llList2Json(JSON_OBJECT, ["action", "unpair"])
    );
}

default
{
    state_entry()
    {
        bankToken = llLinksetDataRead(TOKEN_KEY);
        string inflight = llLinksetDataRead(INFLIGHT_KEY);

        llSetTimerEvent(8.0);

        if (inflight != "")
        {
            llOwnerSay("WARNING: this object was reset while a payment may have been in flight.");
            llOwnerSay("Do not approve another payment until you check your Second Life transaction history.");
        }

        if (bankToken == "")
            llOwnerSay("Passport Bank ready. Touch it to begin pairing.");
        else
            llOwnerSay("Passport Bank restarted. Saved pairing token loaded.");
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
            llLinksetDataWrite(INFLIGHT_KEY, "");
            llResetScript();
        }
    }

    touch_start(integer total_number)
    {
        if (llDetectedKey(0) != llGetOwner()) return;

        if (bankToken == "")
        {
            registerObject();
            return;
        }

        showMenu(
            ["Check Now", "Reset Pairing"],
            "Passport Bank\n\nPayer: " + payerUsername
            + "\nRecipient: " + recipientUsername
            + "\nFixed payment: L$1000",
            "menu"
        );
    }

    timer()
    {
        pollBank();
    }

    listen(integer channel, string name, key id, string message)
    {
        if (id != llGetOwner()) return;

        if (dialogMode == "payment")
        {
            if (message == "PAY 1000")
            {
                if (!identityVerified || !debitReady || recipientKey == NULL_KEY)
                {
                    llOwnerSay("Bank is not fully verified/authorized yet.");
                }
                else if (currentAmount != 1000)
                {
                    llOwnerSay("Refusing payment: amount is not exactly L$1000.");
                }
                else if (transferTxn != NULL_KEY)
                {
                    llOwnerSay("A transfer is already in progress.");
                }
                else
                {
                    transferTxn = llTransferLindenDollars(recipientKey, 1000);
                    llLinksetDataWrite(INFLIGHT_KEY, currentRequest + "|" + (string)transferTxn);
                    llOwnerSay("Sending L$1000 to " + recipientUsername + "...");
                }
            }
            else if (message == "Cancel")
            {
                llOwnerSay("Payment left pending. It can be approved later.");
            }
        }
        else if (dialogMode == "menu")
        {
            if (message == "Check Now")
                pollBank();
            else if (message == "Reset Pairing")
                showMenu(
                    ["YES Reset", "Cancel"],
                    "Reset Passport Bank pairing?\n\nThis does not send money.",
                    "reset"
                );
        }
        else if (dialogMode == "reset")
        {
            if (message == "YES Reset")
                requestUnpair();
        }

        if (dialogHandle)
        {
            llListenRemove(dialogHandle);
            dialogHandle = 0;
        }
    }

    dataserver(key queryid, string data)
    {
        if (queryid == qOwnerName)
        {
            qOwnerName = NULL_KEY;
            ownerResolved = data;
            tryFinishVerification();
            return;
        }

        if (queryid == qRecipientKey)
        {
            qRecipientKey = NULL_KEY;
            recipientKey = (key)data;
            if (recipientKey == NULL_KEY)
            {
                verifying = FALSE;
                llOwnerSay("Could not resolve recipient username: " + recipientUsername);
                return;
            }
            qRecipientName = llRequestUsername(recipientKey);
            return;
        }

        if (queryid == qRecipientName)
        {
            qRecipientName = NULL_KEY;
            recipientResolved = data;
            tryFinishVerification();
            return;
        }
    }

    run_time_permissions(integer perm)
    {
        if (perm & PERMISSION_DEBIT)
        {
            debitReady = TRUE;
            llOwnerSay("Debit permission granted. Passport Bank is ready for fixed L$1000 payments.");
            reportDebitReady(TRUE);
        }
        else
        {
            debitReady = FALSE;
            llOwnerSay("Debit permission was not granted. No payments can occur.");
            reportDebitReady(FALSE);
        }
    }

    transaction_result(key id, integer success, string data)
    {
        if (id != transferTxn) return;

        if (success)
            llOwnerSay("Second Life confirmed the L$1000 transfer to " + recipientUsername + ".");
        else
            llOwnerSay("Payment failed: " + data);

        sendTransferResult(success, data);
    }

    http_response(key request_id, integer status, list metadata, string body)
    {
        if (request_id == reqRegister)
        {
            reqRegister = NULL_KEY;

            if (status < 200 || status >= 300 || llJsonGetValue(body, ["ok"]) != "true")
            {
                llOwnerSay("Could not start pairing. If another Passport Bank is already paired, reset that one first.");
                return;
            }

            string code = llJsonGetValue(body, ["code"]);
            bankToken = llJsonGetValue(body, ["token"]);

            if (bankToken == "" || bankToken == JSON_INVALID)
            {
                bankToken = "";
                llOwnerSay("Pairing response was incomplete.");
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
            {
                string err = llJsonGetValue(body, ["error"]);
                if (err == "not_paired" || err == "object_auth_failed")
                {
                    bankToken = "";
                    llLinksetDataWrite(TOKEN_KEY, "");
                    llOwnerSay("This object is no longer paired. Touch it to pair again.");
                }
                return;
            }

            if (status < 200 || status >= 300) return;
            if (llJsonGetValue(body, ["ok"]) != "true") return;

            integer verified = (llJsonGetValue(body, ["identity_verified"]) == "true");
            integer ready = (llJsonGetValue(body, ["debit_ready"]) == "true");
            string setupPayer = llJsonGetValue(body, ["setup", "payer_username"]);
            string setupRecipient = llJsonGetValue(body, ["setup", "recipient_username"]);
            string setupRecipientKey = llJsonGetValue(body, ["setup", "recipient_uuid"]);

            if (!verified)
            {
                identityVerified = FALSE;
                debitReady = FALSE;

                if (setupPayer != JSON_NULL && setupPayer != ""
                    && setupRecipient != JSON_NULL && setupRecipient != "")
                    beginVerification(setupPayer, setupRecipient);

                return;
            }

            identityVerified = TRUE;
            payerUsername = setupPayer;
            recipientUsername = setupRecipient;

            if (setupRecipientKey != JSON_NULL && setupRecipientKey != "")
                recipientKey = (key)setupRecipientKey;

            debitReady = ready;

            if (!debitReady && recipientKey != NULL_KEY)
                requestDebitPermission();

            string pendingId = llJsonGetValue(body, ["pending", "id"]);
            if (pendingId != JSON_NULL && pendingId != "" && pendingId != JSON_INVALID)
            {
                integer amount = (integer)llJsonGetValue(body, ["pending", "amount"]);
                string sourceKind = llJsonGetValue(body, ["pending", "source_kind"]);
                string pendingRecipient = llJsonGetValue(body, ["pending", "recipient_username"]);
                string pendingRecipientKey = llJsonGetValue(body, ["pending", "recipient_uuid"]);

                if (amount != 1000)
                {
                    llOwnerSay("Refusing malformed payment request: amount is not L$1000.");
                    return;
                }

                if ((key)pendingRecipientKey != recipientKey)
                {
                    llOwnerSay("Refusing payment request: recipient UUID does not match the verified recipient.");
                    return;
                }

                if (pendingId != currentRequest && transferTxn == NULL_KEY)
                    showPayment(pendingId, sourceKind, amount, pendingRecipient);
            }
            return;
        }

        if (request_id == reqVerify)
        {
            reqVerify = NULL_KEY;
            verifying = FALSE;

            if (status >= 200 && status < 300 && llJsonGetValue(body, ["ok"]) == "true")
            {
                identityVerified = TRUE;
                requestDebitPermission();
            }
            else
            {
                identityVerified = FALSE;
                llOwnerSay("Website identity verification failed. Check both SL usernames in Settings.");
            }
            return;
        }

        if (request_id == reqDebit)
        {
            reqDebit = NULL_KEY;
            return;
        }

        if (request_id == reqResult)
        {
            reqResult = NULL_KEY;

            if (status >= 200 && status < 300 && llJsonGetValue(body, ["ok"]) == "true")
            {
                string result = llJsonGetValue(body, ["status"]);
                if (result == "success")
                    llOwnerSay("Website recorded the L$1000 payment successfully.");
                else
                    llOwnerSay("Website recorded the failed payment.");

                currentRequest = "";
                currentSource = "";
                currentAmount = 0;
                transferTxn = NULL_KEY;
                llLinksetDataWrite(INFLIGHT_KEY, "");
            }
            else
            {
                llOwnerSay("WARNING: Second Life returned a transfer result, but the website could not record it.");
                llOwnerSay("Do not pay again until you check transaction history and resolve the pending payment.");
            }
            return;
        }

        if (request_id == reqUnpair)
        {
            reqUnpair = NULL_KEY;

            if (status >= 200 && status < 300 && llJsonGetValue(body, ["ok"]) == "true")
            {
                bankToken = "";
                llLinksetDataWrite(TOKEN_KEY, "");
                llLinksetDataWrite(INFLIGHT_KEY, "");
                llOwnerSay("Pairing reset. The script will restart.");
                llResetScript();
            }
            else
            {
                llOwnerSay("Could not reset pairing. A payment may still be pending.");
            }
        }
    }
}
