const restify = require("restify");
const {
  CloudAdapter,
  ConfigurationServiceClientCredentialFactory,
  createBotFrameworkAuthenticationFromConfiguration,
} = require("botbuilder");

const crypto = require("crypto");

// ================= DEBUG =================
function secretFingerprint(s) {
  if (!s) return "none";
  return crypto.createHash("sha256").update(s).digest("hex").slice(0, 8);
}

console.log("ENV MICROSOFT_APP_ID present:", !!process.env.MICROSOFT_APP_ID);
console.log("ENV MICROSOFT_APP_PASSWORD present:", !!process.env.MICROSOFT_APP_PASSWORD);

if (process.env.MICROSOFT_APP_ID) {
  console.log("MICROSOFT_APP_ID prefix:", process.env.MICROSOFT_APP_ID.slice(0, 6));
}

if (process.env.MICROSOFT_APP_PASSWORD) {
  console.log("MICROSOFT_APP_PASSWORD length:", process.env.MICROSOFT_APP_PASSWORD.length);
  console.log(
    "MICROSOFT_APP_PASSWORD sha256 fp:",
    secretFingerprint(process.env.MICROSOFT_APP_PASSWORD)
  );
}

console.log("NODE_ENV:", process.env.NODE_ENV);
// =========================================

// ================= TOKEN SELF-TEST =================
async function testBotFrameworkToken() {
  try {
    const clientId = process.env.MICROSOFT_APP_ID;
    const clientSecret = process.env.MICROSOFT_APP_PASSWORD;

    const url =
      "https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token";

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://api.botframework.com/.default",
    });

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    const text = await res.text();

    if (!res.ok) {
      console.error("BOTFRAMEWORK TOKEN TEST FAILED:", res.status, text);
      return;
    }

    console.log("BOTFRAMEWORK TOKEN TEST OK (status 200)");
  } catch (e) {
    console.error("BOTFRAMEWORK TOKEN TEST ERROR:", e);
  }
}
// ===================================================

// ================= CLOUD ADAPTER ===================
const credentialsFactory = new ConfigurationServiceClientCredentialFactory({
  MicrosoftAppId: process.env.MICROSOFT_APP_ID,
  MicrosoftAppPassword: process.env.MICROSOFT_APP_PASSWORD,
  MicrosoftAppType: "MultiTenant",
});

const botFrameworkAuthentication =
  createBotFrameworkAuthenticationFromConfiguration(null, credentialsFactory);

const adapter = new CloudAdapter(botFrameworkAuthentication);

adapter.onTurnError = async (context, error) => {
  console.error("Bot error:", error);
  try {
    await context.sendActivity("Er ging iets mis. Probeer het nog eens.");
  } catch {}
};
// ===================================================

async function askSupportBrain(question) {
  const base = (process.env.SUPPORTBRAIN_WORKER_URL || "").replace(/\/+$/, "");
  const res = await fetch(`${base}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Worker /ask error ${res.status}: ${t}`);
  }

  const data = await res.json();
  return data?.answer || "Geen antwoord gevonden.";
}

const server = restify.createServer();
server.use(restify.plugins.bodyParser());

server.get("/health", async (req, res) => {
  res.send(200, { ok: true, service: "supportbrain-teams-adapter" });
});

server.post("/api/messages", async (req, res) => {
  await adapter.process(req, res, async (context) => {
    if (context.activity.type !== "message") return;

    const text = (context.activity.text || "").trim();
    if (!text) return;

    const answer = await askSupportBrain(text);
    await context.sendActivity(answer);
  });
});

const port = process.env.PORT || 3978;

server.listen(port, () => {
  console.log(`Listening on ${port}`);
  testBotFrameworkToken(); // Run token test at startup
});
