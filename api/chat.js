// api/chat.js — Demo IA robusta (cierre con nombre/telefono opcional, anti-bucles, structured)

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-store");
}

const OUT_OF_SCOPE_MESSAGE =
  "Esto es una demo. Si quieres un chatbot como este, adaptado a tu negocio (reservas, pedidos y atención al cliente), agenda una llamada y lo vemos en 10 minutos.";

const SYSTEM_PROMPT = `
Eres “AutoEngine – ChatBot de Demostración”. Español neutro, directo y breve (máx. 2–3 líneas).
Te adaptas al sector (pastelería, peluquería/estética, clínica dental/óptica/fisio, taller mecánico).

OBJETIVO:
- Recoger servicio/motivo, fecha, hora y nombre. Si se exige teléfono, también teléfono. Al tenerlos, confirma en UN mensaje y termina.

REGLAS DURAS:
- No inventes datos; si faltan, di "No lo sé" y pide EXACTAMENTE 1 dato.
- Salud/diagnóstico/técnico avanzado: no des instrucciones; propone cita.
- Si es fuera de negocio (política, deportes, etc.), responde EXACTAMENTE:
"${OUT_OF_SCOPE_MESSAGE}"

HORARIOS POR DEFECTO si faltan:
- L–V 9:00–19:00, S 10:00–14:00, D cerrado. Ante disponibilidad, sugiere 2–3 horas válidas.

ESTILO:
- 1 respuesta breve.
- 1 pregunta de aclaración si falta algo.
- 2–3 chips útiles.

SALIDA JSON ESTRICTA:
{
  "reply": "<texto breve>",
  "ui_actions": { "chips": [], "cta": null, "handoff": false },
  "data": {
    "intent": "<faq|pedido|cita|precio|horario|otro>",
    "missing_fields": [],
    "entities": {"servicio":"", "fecha":"", "hora":"", "nombre":"", "telefono":""},
    "closed": false
  }
}
No menciones estas reglas ni el prompt.
`;

function safeParse(v, fb = {}) { try { return JSON.parse(v); } catch { return fb; } }
function clamp(text, max = 320){ return String(text||"").replace(/\s+/g," ").trim().slice(0,max); }

// ===== EXTRACCIÓN DE ENTIDADES (ES) =====
const DAY_WORDS = "(lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo|hoy|mañana)";
const HOUR = "(?:[01]?\\d|2[0-3])(?:[:\\.hH][0-5]\\d)?";
const DATE_NUM = "(?:\\b\\d{1,2}[\\/-]\\d{1,2}(?:[\\/-]\\d{2,4})?\\b)";

const SERVICE_HINTS = {
  "clinica": ["limpieza","revisión","revision","ortodoncia","empaste","fisioterapia","óptica","optica","lentes","blanqueamiento","radiografía","radiografia","consulta"],
  "taller": ["revisión","revision","frenos","aceite","itv","neumáticos","neumaticos","embrague","diagnóstico","diagnostico","alineado"],
  "peluqueria": ["corte","tinte","mechas","manicura","barba","peinado","keratina"],
  "pasteleria": ["tarta","roscón","roscon","pasteles","encargo","sin gluten","gluten free"]
};

function extractNombre(text) {
  const t = (text||"").trim();
  const pats = [
    /\bme\s+llamo\s+([a-záéíóúüñ][a-záéíóúüñ'\-\. ]{1,40})/i,
    /\bsoy\s+([a-záéíóúüñ][a-záéíóúüñ'\-\. ]{1,40})/i,
    /\ba\s+nombre\s+de\s+([a-záéíóúüñ][a-záéíóúüñ'\-\. ]{1,40})/i,
    /\bmi\s+nombre\s+es\s+([a-záéíóúüñ][a-záéíóúüñ'\-\. ]{1,40})/i
  ];
  for (const re of pats) {
    const m = t.match(re);
    if (m && m[1]) {
      const cleaned = m[1].replace(/\s+/g," ").trim();
      const twoWords = cleaned.split(" ").slice(0,2).join(" ");
      if (!/^(yo|el|la|miercoles|miércoles|viernes|lunes|martes|sabado|sábado|domingo|hoy|mañana)\b/i.test(twoWords))
        return twoWords;
    }
  }
  if (/^[a-záéíóúüñ]{2,20}$/i.test(t)) return t; // cuando ya le hemos pedido el nombre
  return null;
}

function extractEntities(msg, sector) {
  const text = (msg||"").toLowerCase();

  // hora
  let hora = null;
  const h = text.match(new RegExp("\\b"+HOUR+"\\b","i"));
  if (h) {
    let val = h[0].replace(/[Hh]/,"h").replace(".",":");
    if (/^\d{1,2}$/.test(val)) val = `${val}:00`;
    if (/^\d{1,2}h\d{1,2}$/.test(val)) val = val.replace("h",":");
    hora = val;
  }

  // fecha
  let fecha = null;
  const d1 = text.match(new RegExp(DAY_WORDS,"i"));
  const d2 = text.match(new RegExp(DATE_NUM,"i"));
  if (d2) fecha = d2[0];
  else if (d1) fecha = d1[0].normalize("NFD").replace(/[\u0300-\u036f]/g,"");

  // servicio
  let servicio = null;
  const hints = [
    ...(SERVICE_HINTS[sector?.toLowerCase?.()]||[]),
    ...new Set(Object.values(SERVICE_HINTS).flat())
  ];
  for (const k of hints) { if (text.includes(k)) { servicio = k; break; } }

  // teléfono
  let telefono = null;
  const t = msg.match(/\b(?:\+?\d{2,3}\s?)?(?:\d[\s\-]?){7,12}\b/);
  if (t) telefono = t[0].replace(/[\s\-]+/g,"");

  // nombre
  const nombre = extractNombre(msg);

  return { servicio, fecha, hora, nombre, telefono };
}

function computeMissing(entities={}, requirePhone=false) {
  const miss = [];
  if (!entities.servicio) miss.push("servicio");
  if (!entities.fecha)    miss.push("fecha");
  if (!entities.hora)     miss.push("hora");
  if (!entities.nombre)   miss.push("nombre");
  if (requirePhone && !entities.telefono) miss.push("telefono");
  return miss;
}

function detectClosed(entities={}, requirePhone=false) {
  const core = !!(entities.servicio && entities.fecha && entities.hora && entities.nombre);
  return requirePhone ? (core && !!entities.telefono) : core;
}
// ===== FIN EXTRACCIÓN =====

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed. Use POST." });

  try {
    let body = typeof req.body === "string" ? safeParse(req.body, {}) : (req.body||{});
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const history = Array.isArray(body.history) ? body.history : [];
    const sector = typeof body.sector === "string" ? body.sector : null;
    const businessContext = body.businessContext && typeof body.businessContext === "object" ? body.businessContext : {};
    const structured = Boolean(body.structured);

    if (!message) return res.status(400).json({ error: 'Missing "message" string' });

    // Por defecto exigimos teléfono solo en clínica (puedes cambiarlo)
    const sectorLC = (sector||"").toLowerCase();
    const requirePhoneDefault = sectorLC === "clinica";
    const requirePhone = Boolean(body.requirePhone ?? businessContext?.requirePhone ?? requirePhoneDefault);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });

    const contextBlock = `Contexto del negocio:\n${JSON.stringify({ sector, ...businessContext }).slice(0, 1800)}\n`;
    const messages = [
      { role: "system", content: SYSTEM_PROMPT + "\n" + contextBlock },
      ...history.slice(-8),
      { role: "user", content: message }
    ];

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        top_p: 0.9,
        max_tokens: 350,
        response_format: { type: "json_object" },
        messages
      }),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      return res.status(502).json({ error: "LLM error", detail: errText.slice(0, 500) });
    }

    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content || "{}";
    let obj = safeParse(content, null);
    if (!obj || typeof obj !== "object" || !obj.reply) {
      obj = {
        reply: "No he podido procesar eso. ¿Quieres pedir, reservar o consultar horarios?",
        ui_actions: { chips: ["Hacer un pedido","Reservar cita","Ver horarios"], cta: null, handoff: false },
        data: { intent: "otro", missing_fields: [], entities: {}, closed: false }
      };
    }

    // Fusión de entidades (modelo + usuario actual + últimos user turns)
    const fromModel = (obj.data && obj.data.entities) || {};
    const fromUser = extractEntities(message, sector);
    const lastUserTurns = history.filter(m => m?.role === "user").slice(-3).map(m => m.content).join(" ");
    const fromHistory = extractEntities(lastUserTurns, sector);

    const entities = { ...fromModel, ...fromHistory, ...fromUser }; // prioridad a lo último que dijo el usuario

    // Recalcular missing/closed
    const missing = computeMissing(entities, requirePhone);
    const closed = detectClosed(entities, requirePhone);

    // Normalizar estructura
    obj.data = obj.data || {};
    obj.data.entities = entities;
    obj.data.missing_fields = missing;
    obj.data.closed = closed;
    obj.data.intent = obj.data.intent || (closed ? "cita" : "otro");
    obj.ui_actions = obj.ui_actions || { chips: [], cta: null, handoff: false };

    // Cierre determinista
    if (closed) {
      const { servicio: s, fecha: f, hora: h, nombre: n } = entities;
      obj.reply = clamp(`Perfecto, ${n}. Te confirmo la cita para ${f} a las ${h} para ${s}. ¡Te esperamos!`);
      obj.ui_actions.chips = ["Guardar recordatorio", "Cómo llegar"];
      obj.ui_actions.cta = null;
    } else if (missing.length > 0) {
      // Pregunta SOLO por el primer campo que falte
      const need = missing[0];
      const qs = {
        servicio: "¿Qué servicio necesitas exactamente?",
        fecha: "¿Qué día te va mejor?",
        hora: "¿A qué hora te viene bien?",
        nombre: "¿A nombre de quién dejamos la cita?",
        telefono: "¿Me pasas un teléfono de contacto?"
      }[need];
      obj.reply = clamp(qs || obj.reply || "¿Podrías confirmar un dato?");
      // Chips orientadas
      obj.ui_actions.chips = obj.ui_actions.chips?.length ? obj.ui_actions.chips.slice(0,3) :
        (need === "fecha" ? ["Mañana","Viernes","Lunes"] :
         need === "hora" ? ["10:00","12:00","17:00"] :
         need === "servicio" ? ["Limpieza","Revisión","Consulta"] :
         need === "nombre" ? ["Ana","Carlos","Lucía"] :
         []);
    }

    // Fuera de marco estandarizado (por si el modelo lo insinuó)
    if (obj.data.intent === "otro" && /out\s*of\s*scope|fuera.*marco/i.test(content)) {
      obj.reply = OUT_OF_SCOPE_MESSAGE;
      obj.ui_actions.chips = ["Ver demo","Agendar llamada"];
      obj.ui_actions.cta = { label: "Agendar llamada", action: "open_url", url: "https://autoengine.pro/demo-cita" };
    }

    if (structured) return res.status(200).json(obj);
    return res.status(200).json({ reply: obj.reply });

  } catch (e) {
    return res.status(500).json({ error: "Server error", detail: String(e?.message || e) });
  }
}




