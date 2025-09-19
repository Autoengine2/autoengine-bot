// api/chat.js — Demo IA con cierre de conversación y CTA fuera de marco

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function clampLines(text, maxLines = 3) {
  const lines = String(text || "").trim().split(/\r?\n/).filter(Boolean);
  return lines.slice(0, maxLines).join(" ").slice(0, 320);
}

// Mensaje estándar para fuera de marco
const OUT_OF_SCOPE_MESSAGE =
  "Esto es una demo. Si quieres un chatbot como este, adaptado a tu negocio (reservas, pedidos y atención al cliente), agenda una llamada y lo vemos en 10 minutos.";

const SYSTEM_PROMPT = `
Eres un asistente DEMO de AutoEngine.

Actúas como recepcionista de un negocio local (pastelería, peluquería/estética, clínica dental/óptica/fisio, o taller mecánico).
Responde en español neutro, con **máximo 2–3 líneas**, tono amable y directo.

Funciones:
- Gestiona **reservas, pedidos y horarios**.
- Responde a **preguntas básicas de atención al cliente** relacionadas con el sector:
  • Pastelería: pedidos, alérgenos generales, recogida/entrega, precios orientativos.  
  • Peluquería/Clínica: citas, revisiones, limpiezas, molestias/síntomas → da orientación general y propone cita (sin diagnóstico).  
  • Taller: revisiones/averías comunes, tiempos/precios orientativos y propuesta de cita.  

Horarios:
- Siempre responde con horario ficticio estándar: L–V 9:00–19:00, S 10:00–14:00, D cerrado.  
- Si piden disponibilidad, ofrece **2–3 opciones concretas** (ej. hoy 12:00, mañana 10:30, viernes 17:00).  

Cierre de conversación:
- Tu objetivo es conseguir **día, hora y motivo/servicio**.  
- Una vez el cliente ya haya dado esos tres datos, **confirma la reserva/pedido y cierra la conversación** en un único mensaje.  
- Ejemplo:  
  "Perfecto, te confirmo la cita para el lunes a las 12:00 para revisión de suspensión. ¡Te esperamos!"  
- Tras dar el mensaje de cierre, **no sigas preguntando nada más**.  
- Si el cliente responde con un agradecimiento o cortesía después del cierre, responde **una sola vez** con algo breve tipo:  
  "Gracias a ti. Recuerda que esto es solo una demo de AutoEngine."  
  y no continúes la conversación.  

Límites:
- No des diagnósticos médicos ni instrucciones técnicas avanzadas.  
- Ante síntomas o averías, orienta y sugiere cita (no bloquees).  
- Solo si la pregunta es completamente fuera del negocio (política, ciencia, deportes, etc.), responde exactamente:  
"${OUT_OF_SCOPE_MESSAGE}"
`;

export default async function handler(req, res) {
  cors(res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed. Use POST." });

  try {
    // Aceptar body como string u objeto
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {}
    }
    body = body && typeof body === "object" ? body : {};

    const message = typeof body.message === "string" ? body.message : "";
    const history = Array.isArray(body.history) ? body.history : [];

    if (!message.trim())
      return res.status(400).json({ error: 'Missing "message" string' });

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.slice(-8),
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
        temperature: 0.5,
        max_tokens: 220,
        messages,
      }),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      return res
        .status(500)
        .json({ error: "LLM error", detail: errText.slice(0, 300) });
    }

    const data = await r.json();
    const raw = data?.choices?.[0]?.message?.content?.trim() || "";

    const reply = clampLines(raw || OUT_OF_SCOPE_MESSAGE, 3);
    return res.status(200).json({ reply });
  } catch (e) {
    return res
      .status(500)
      .json({ error: "Server error", detail: String(e?.message || e) });
  }
}



