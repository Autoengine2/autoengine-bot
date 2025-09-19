// api/chat.js — Vercel Serverless Function (Node, CommonJS) con CORS + guardrails

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*"); // luego afinamos con tu dominio de Framer
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function clampLines(text, maxLines = 3) {
  const lines = String(text || "").trim().split(/\r?\n/).filter(Boolean);
  return lines.slice(0, maxLines).join(" ").slice(0, 320);
}

const SYSTEM_PROMPT =
  "Eres un asistente DEMO de AutoEngine. Responde SOLO sobre horarios, reservas y pedidos, " +
  "y precios aproximados sin comprometer. Máximo 2–3 líneas. " +
  "Si te preguntan algo fuera de esto, responde: 'Esta es una demo. Para verlo aplicado a tu negocio, agenda una llamada.' " +
  "Sé claro, directo y amable. No uses emojis. Español neutro.";

module.exports = async (req, res) => {
  cors(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { message = "", history = [] } = req.body || {};
    if (!message || typeof message !== "string") {
      res.status(400).json({ error: 'Missing "message" string' });
      return;
    }

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...[].concat(history || []).slice(-8),
      { role: "user", content: message },
    ];

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "Missing OPENAI_API_KEY" });
      return;
    }

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        max_tokens: 120,
        messages,
      }),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      res.status(500).json({ error: "LLM error", detail: errText.slice(0, 300) });
      return;
    }

    const data = await r.json();
    const raw =
      data?.choices?.[0]?.message?.content ||
      "Esta es una demo. Para verlo aplicado a tu negocio, agenda una llamada.";
    const reply = clampLines(raw, 3);

    res.status(200).json({ reply });
  } catch (e) {
    res.status(500).json({ error: "Server error", detail: String(e?.message || e) });
  }
};

