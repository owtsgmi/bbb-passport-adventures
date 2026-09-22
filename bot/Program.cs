using System.Net.Http.Json;
using System.Text.Json.Serialization;
using LibreMetaverse;

const string DefaultApi = "https://tzxlrglgwzinefutledx.supabase.co/functions/v1/payout-push";

string Need(string name)
{
    var v = Environment.GetEnvironmentVariable(name)?.Trim();
    if (string.IsNullOrWhiteSpace(v))
        throw new InvalidOperationException($"Missing required environment variable: {name}");
    return v;
}

var slUsername = Need("SL_USERNAME");
var slPassword = Need("SL_PASSWORD");
var botToken = Need("BOT_TOKEN");
var apiUrl = Environment.GetEnvironmentVariable("PAYOUT_API")?.Trim();
if (string.IsNullOrWhiteSpace(apiUrl)) apiUrl = DefaultApi;
var pollSeconds = int.TryParse(Environment.GetEnvironmentVariable("POLL_SECONDS"), out var n)
    ? Math.Clamp(n, 5, 300)
    : 20;

var nameParts = slUsername.Split('.', 2, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
var firstName = nameParts[0];
var lastName = nameParts.Length > 1 ? nameParts[1] : "Resident";

using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
var client = new GridClient();
Settings.UserAgent = "PassportAdventuresMessenger/1.0";
client.Settings.Timing.LoginTimeout = 30_000;

Console.WriteLine($"Passport Messenger starting for {slUsername}...");

var login = client.Network.DefaultLoginParams(
    firstName,
    lastName,
    slPassword,
    "PassportAdventuresMessenger",
    "1.0.0");

var loggedIn = await client.Network.LoginAsync(login);
if (!loggedIn)
    throw new InvalidOperationException($"Second Life login failed: {client.Network.LoginMessage}");

Console.WriteLine($"Logged in to Second Life as {slUsername}.");

while (true)
{
    try
    {
        var pollResponse = await http.PostAsJsonAsync(apiUrl, new
        {
            action = "bot_poll",
            bot_token = botToken,
            bot_name = slUsername
        });

        var poll = await pollResponse.Content.ReadFromJsonAsync<PollResponse>();

        if (!pollResponse.IsSuccessStatusCode || poll?.Ok != true)
        {
            Console.WriteLine($"Poll failed: HTTP {(int)pollResponse.StatusCode} {poll?.Error}");
        }
        else if (poll.Job is not null)
        {
            var ok = true;
            string? error = null;

            try
            {
                var target = new UUID(poll.Job.TargetUuid);
                Console.WriteLine($"Sending {poll.Job.Kind} IM to {poll.Job.TargetUsername ?? poll.Job.TargetUuid}: {poll.Job.Message}");
                client.Self.InstantMessage(target, poll.Job.Message);
                await Task.Delay(1000);
            }
            catch (Exception ex)
            {
                ok = false;
                error = ex.Message;
                Console.WriteLine($"Send failed: {ex}");
            }

            var ack = await http.PostAsJsonAsync(apiUrl, new
            {
                action = "bot_ack",
                bot_token = botToken,
                job_id = poll.Job.Id,
                success = ok,
                error
            });

            if (!ack.IsSuccessStatusCode)
                Console.WriteLine($"Ack failed: HTTP {(int)ack.StatusCode}");
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Loop error: {ex.Message}");
    }

    await Task.Delay(TimeSpan.FromSeconds(pollSeconds));
}

sealed class PollResponse
{
    [JsonPropertyName("ok")] public bool Ok { get; set; }
    [JsonPropertyName("error")] public string? Error { get; set; }
    [JsonPropertyName("job")] public ImJob? Job { get; set; }
}

sealed class ImJob
{
    [JsonPropertyName("id")] public string Id { get; set; } = "";
    [JsonPropertyName("target_uuid")] public string TargetUuid { get; set; } = "";
    [JsonPropertyName("target_username")] public string? TargetUsername { get; set; }
    [JsonPropertyName("message")] public string Message { get; set; } = "";
    [JsonPropertyName("kind")] public string Kind { get; set; } = "";
}
