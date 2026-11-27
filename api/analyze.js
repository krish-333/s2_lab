// Vercel serverless function: sends a photo to Claude and returns the answer.
// Env vars (Vercel > Settings > Environment Variables): ANTHROPIC_API_KEY (required), APP_PASSWORD (recommended), ANTHROPIC_MODEL (optional).
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set in Vercel" });
  const pw = process.env.APP_PASSWORD;
  if (pw && req.headers["x-app-password"] !== pw) return res.status(401).json({ error: "Wrong app password" });
  const { image, prompt } = req.body || {};
  if (!image) return res.status(400).json({ error: "No image received" });
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
        max_tokens: 700,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
          { type: "text", text: prompt || "What am I looking at? Be concise." }
        ] }]
      })
    });
    const d = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: (d.error && d.error.message) || "Anthropic API error" });
    res.status(200).json({ text: (d.content || []).filter(b => b.type === "text").map(b => b.text).join("\n") });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
