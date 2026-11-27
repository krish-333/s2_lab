// Vercel serverless function: sends a photo + question to Gemini and returns the answer.
// Env vars (Vercel > Settings > Environment Variables):
//   GEMINI_API_KEY (required), APP_PASSWORD (recommended), GEMINI_MODEL (optional, default gemini-2.5-flash)
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "GEMINI_API_KEY is not set in Vercel" });
  const pw = process.env.APP_PASSWORD;
  if (pw && req.headers["x-app-password"] !== pw) return res.status(401).json({ error: "Wrong app password" });
  const { image, prompt } = req.body || {};
  if (!image) return res.status(400).json({ error: "No image received" });
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [
          { inlineData: { mimeType: "image/jpeg", data: image } },
          { text: prompt || "What am I looking at? Be concise." }
        ] }]
      })
    });
    const d = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: (d.error && d.error.message) || "Gemini API error" });
    const parts = (d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || [];
    const text = parts.map(p => p.text || "").join("\n").trim();
    res.status(200).json({ text: text || "Gemini returned no text (the photo may have been blocked by a safety filter)." });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
