const restify = require("restify");
const { BotFrameworkAdapter } = require("botbuilder");

// --- DEBUG BLOCK (safe logging: no secrets printed) ---
const crypto = require("crypto");

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
// --- END DEBUG BLOCK ---


const adapter = new BotFrameworkAdapter({
  appId: process.env.MICROSOFT_APP_ID,
  appPassword: process.env.MICROSOFT_APP_PASSWORD,
});

adapter.onTurnError = async (context, error) => {
  console.error("Bot error:", error);
  try {
    await context.sendActivity("Er ging iets mis. Probeer het nog eens.");
  } catch {}
};

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
  try {
    await adapter.processActivity(req, res, async (context) => {
      if (context.activity.type !== "message") return;

      const text = (context.activity.text || "").trim();
      if (!text) return;

      const answer = await askSupportBrain(text);
      await context.sendActivity(answer);
    });
  } catch (err) {
    console.error("processActivity error:", err);
    // Restify expects a response; adapter usually handles it, but just in case:
    res.send(500, { error: "Bot processing failed" });
  }
});

const port = process.env.PORT || 3978;
server.listen(port, () => console.log(`Listening on ${port}`));
