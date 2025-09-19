// api/chat.js — Vercel Edge Function con CORS + guardrails
export const config = { runtime: "edge" };

function clampLines(text, maxLines = 3) {
  const lines = String(text || "").trim().split(/\r?\n/).filter(Boolean);
  return lines.slice(0, maxLines).join(" ").slice(0, 320);
}

const SYSTEM_PROMPT =
  "Eres un asistente DEMO de AutoEngine. Responde SOLO sobre horarios, reservas y pedidos, " +
  "y precios aproximados sin comprometer. Máximo 2–3 líneas. " +
  "Si te preguntan algo fuera de esto, responde: 'Esta es una demo. Para verlo aplicado a tu negocio, agenda una llamada.' " +
  "Sé claro, directo y amable. No uses emojis. Español neutro.";

function corsHeaders(origin) {
  // Para salir del paso dejamos *. Luego afinaremos con el dominio de Framer.
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export default async function handler(req) {
  const origin = req.headers.get("origin") || "*";

  // Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const message = typeof body?.message === "string" ? body.message : "";
    const history = Array.isArray(body?.history) ? body.history : [];

    if (!message) {
      return new Response(JSON.stringify({ error: 'Missing "message" string' }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.slice(-8),
      { role: "user", content: message },
    ];

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing OPENAI_API_KEY" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
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
      return new Response(JSON.stringify({ error: "LLM error", detail: errText.slice(0, 300) }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    const data = await r.json();
    const raw =
      data?.choices?.[0]?.message?.content ||
      "Esta es una demo. Para verlo aplicado a tu negocio, agenda una llamada.";
    const reply = clampLines(raw, 3);

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Server error", detail: String(e?.message || e) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  }
}
