// /api/chat.js — Vercel Serverless Function (Node, CommonJS) con CORS + guardrails

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*"); // luego podrás restringir a tu dominio Framer
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function clampLines(text, maxLines = 3) {
  const lines = String(text || "").trim().split(/\r?\n/).filter(Boolean);
  return lines.slice(0, maxLines).join(" ").slice(0, 320);
}

// 🔧 PROMPT AFINADO (permite horarios/ reservas/ pedidos y limita inventos)
const SYSTEM_PROMPT =
  "Eres un asistente DEMO de AutoEngine para una web de negocio local. " +
  "Responde SOLO sobre: horarios de apertura/cierre, disponibilidad para reservas/citas y pedidos básicos, con precios aproximados no vinculantes. " +
  "Si preguntan fuera de esto, responde: 'Esta es una demo. Para verlo aplicado a tu negocio, agenda una llamada.' " +
  "Si preguntan por HORARIOS (p. ej., '¿Qué horario hacéis?'), contesta con un horario de ejemplo claro y breve marcado como orientativo. " +
  "Máximo 2–3 líneas; tono directo y útil. Si no sabes un dato exacto, da un ejemplo realista y di que es orientativo.";

// 🛟 Reglas rápidas: responden de inmediato sin ir al LLM en casos típicos
function quickRules(userText) {
  const t = String(userText || "").toLowerCase();

  // HORARIOS
  if (/(horario|a qué hora|a que hora|abrís|abris|cerráis|cerrais|abrir|cerrar|a qué horas|a que horas|horarios)/.test(t)) {
    return "Horario orientativo: Lun–Vie 9:30–13:30 y 16:00–20:00; Sáb 10:00–14:00; Dom cerrado.";
  }

  // DISPONIBILIDAD / RESERVAS
  if (/(cuándo puedo|cuando puedo|disponibilidad|reserv(a|ar)|cita|turno|día y hora|dia y hora|agenda|huecos)/.test(t)) {
    return "Tenemos huecos esta semana por la mañana y tarde. Dime día y hora aproximados y te confirmo.";
  }

  // PEDIDOS
  if (/(pedido|encargo|encargar|hacer un pedido|realizar pedido|precio|presupuesto)/.test(t)) {
    return "Indica producto, cantidad y fecha deseada. Te doy precio aproximado y confirmo disponibilidad (orientativo).";
  }

  return null;
}

// —— HANDLER VERCEL —— //
module.exports = async function handler(req, res) {
  // Preflight CORS
  if (req.method === "OPTIONS") {
    cors(res);
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    cors(res);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    cors(res);

    // 1) Leer body y normalizar mensaje del usuario
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const userMessage =
      body?.message ||
      body?.text ||
      body?.prompt ||
      body?.input ||
      "";

    // 2) Reglas rápidas (si coinciden, respondemos ya)
    const fallback = quickRules(userMessage);
    if (fallback) {
      return res.status(200).json({ reply: clampLines(fallback) });
    }

    // 3) LLAMADA AL LLM (usa tu bloque existente aquí)
    // ------------------------------------------------------------------
    // ⬇️⬇️⬇️ SUSTITUYE SOLO LO DE DENTRO POR TU CÓDIGO DE LLM SI YA LO TENÍAS ⬇️⬇️⬇️

    // ❗ Opción A (recomendada): pega aquí tu bloque existente que llama a tu proveedor de IA,
    // usando SYSTEM_PROMPT y userMessage, y devuelve un texto breve (2–3 líneas).
    // Asegúrate de que el resultado final lo pases por clampLines() antes de responder.

    // ❗ Opción B (plantilla mínima con OpenAI; solo si NO tienes bloque):
    //    - Requiere process.env.OPENAI_API_KEY configurado en Vercel.
    //    - Si ya tienes otra lib/proveedor, ignora esto y usa tu bloque.
    /*
    const fetch = (await import("node-fetch")).default;
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: String(userMessage) }
        ],
        temperature: 0.3,
        max_tokens: 120
      })
    });

    if (!openaiRes.ok) {
      throw new Error(`LLM error: ${openaiRes.status} ${await openaiRes.text()}`);
    }
    const data = await openaiRes.json();
    const aiText = data?.choices?.[0]?.message?.content || "Esta es una demo. Para verlo aplicado a tu negocio, agenda una llamada.";
    return res.status(200).json({ reply: clampLines(aiText, 3) });
    */

    // ⬆️⬆️⬆️ FIN ZONA DE SUSTITUCIÓN DEL LLM ⬆️⬆️⬆️
    // ------------------------------------------------------------------

    // 🔒 Fallback por si no pegaste ningún bloque LLM (nunca dejamos vacío)
    const safeDefault = "Esta es una demo. Para verlo aplicado a tu negocio, agenda una llamada.";
    return res.status(200).json({ reply: clampLines(safeDefault) });

  } catch (err) {
    console.error("[/api/chat] Error:", err);
    cors(res);
    return res.status(200).json({
      reply: clampLines("Esta es una demo. Para verlo aplicado a tu negocio, agenda una llamada."),
      error: "handled"
    });
  }
};



