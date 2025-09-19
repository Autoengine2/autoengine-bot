// api/chat.js — Vercel Serverless Function (Node) con CORS + guardrails

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

export default async function handler(req, res) {
  cors(res);

  // Preflight
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { message = "", history = [] } = req.body || {};
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: 'Missing "message" string' });
    }

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...[].concat(history || []).slice(-8),
      { role: "user", content: message },
    ];

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
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
      return res.status(500).json({ error: "LLM error", detail: errText.slice(0, 300) });
    }

    const data = await r.json();
    const raw =
      data?.choices?.[0]?.message?.content ||
      "Esta es una demo. Para verlo aplicado a tu negocio, agenda una llamada.";
    const reply = clampLines(raw, 3);

    return res.status(200).json({ reply });
  } catch (e) {
    return res.status(500).json({ error: "Server error", detail: String(e?.message || e) });
  }
}

