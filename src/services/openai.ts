import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";

let cachedGemini: GoogleGenerativeAI | null = null;
let cachedOpenAI: OpenAI | null = null;

function getGeminiClient(): GoogleGenerativeAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Gemini API key not configured");
  if (!cachedGemini) cachedGemini = new GoogleGenerativeAI(key);
  return cachedGemini;
}

function getOpenAIClient(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OpenAI API key not configured");
  if (!cachedOpenAI) cachedOpenAI = new OpenAI({ apiKey: key });
  return cachedOpenAI;
}

const GEMINI_MODEL_CANDIDATES = [
  // Prefer latest aliases first
  "gemini-1.5-pro-latest",
  "gemini-1.5-flash-latest",
  // Try non-latest aliases
  "gemini-1.5-pro",
  "gemini-1.5-flash",
  // Fall back to older stable names
  "gemini-1.0-pro",
  "gemini-pro"
];

export async function generateReply(prompt: string) {
  const provider = (process.env.AI_PROVIDER || '').toLowerCase();
  const systemPrompt = "You are SynapseAI, a highly intelligent and helpful Discord assistant. Provide detailed, thoughtful, and comprehensive responses. You can engage in complex discussions, explain concepts thoroughly, and provide in-depth answers. Be friendly, knowledgeable, and adapt your response length to match the complexity of the question.";
  const fullPrompt = `${systemPrompt}\n\nUser: ${prompt}\nAssistant:`;

  // Prefer explicit provider when set
  if (provider === 'openai') {
    return generateWithOpenAI(fullPrompt);
  }
  if (provider === 'gemini') {
    return generateWithGemini(fullPrompt);
  }

  // Auto: try OpenAI first if configured, else Gemini
  if (process.env.OPENAI_API_KEY) {
    try { return await generateWithOpenAI(fullPrompt); } catch {/* fall through */}
  }
  if (process.env.GEMINI_API_KEY) {
    try { return await generateWithGemini(fullPrompt); } catch (e) { throw e; }
  }
  throw new Error("No AI provider configured (set OPENAI_API_KEY or GEMINI_API_KEY)");
}

async function generateWithGemini(fullPrompt: string) {
  const client = getGeminiClient();
  let lastErr: any = null;
  const preferred = (process.env.GEMINI_MODEL || '').trim();
  const candidates = [
    ... (preferred ? [preferred] : []),
    ...GEMINI_MODEL_CANDIDATES
  ];
  for (const modelName of candidates) {
    try {
      const model = client.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(fullPrompt);
      const response = await result.response;
      const text = response.text();
      return (text || "").trim() || "Sorry, I couldn't form a reply.";
    } catch (e: any) {
      lastErr = e;
      const msg = (e?.message || "").toLowerCase();
      if (msg.includes("not found") || msg.includes("is not supported") || msg.includes("404")) continue;
      break;
    }
  }
  throw lastErr || new Error("Gemini generateContent failed");
}

async function generateWithOpenAI(fullPrompt: string) {
  const client = getOpenAIClient();
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const resp = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: 'You are SynapseAI, a helpful Discord assistant.' },
      { role: 'user', content: fullPrompt }
    ],
    temperature: 0.7,
    max_tokens: 1500
  });
  const text = resp.choices?.[0]?.message?.content ?? '';
  return (text || '').trim() || "Sorry, I couldn't form a reply.";
}

// ----- Memory extraction helpers -----
type ExtractedMemory = { key: string; value: string; type?: 'fact'|'preference'|'note'; confidence?: number };

function buildExtractionPrompt(userMessage: string, assistantMessage?: string) {
  const instructions = `Extract durable, re-usable personal facts or preferences explicitly stated by the USER that would be helpful to remember for future conversations.
Return ONLY a JSON array of objects with keys: key (short label), value (concise content), type ('fact'|'preference'|'note'), confidence (0.0-1.0).
Only include items clearly implied or stated by the user. Do not invent.
Examples of keys: 'name', 'timezone', 'favorite_team', 'project_stack', 'role', 'likes', 'dislikes'.
Limit to at most 5 items.
`;
  const convo = `USER: ${userMessage}\nASSISTANT: ${assistantMessage ?? ''}`.trim();
  return `${instructions}\n\n${convo}`;
}

function tryParseJSONArray(text: string): ExtractedMemory[] {
  if (!text) return [];
  // Strip code fences if present
  const stripped = text.replace(/^```[a-zA-Z]*\n/, '').replace(/```\s*$/, '').trim();
  const first = stripped.indexOf('[');
  const last = stripped.lastIndexOf(']');
  if (first === -1 || last === -1 || last <= first) return [];
  const slice = stripped.slice(first, last + 1);
  try {
    const arr = JSON.parse(slice);
    if (Array.isArray(arr)) return arr as ExtractedMemory[];
  } catch { /* ignore */ }
  return [];
}

export async function extractMemories(userMessage: string, assistantMessage?: string): Promise<ExtractedMemory[]> {
  const provider = (process.env.AI_PROVIDER || '').toLowerCase();
  const prompt = buildExtractionPrompt(userMessage, assistantMessage);
  try {
    if (provider === 'openai' || process.env.OPENAI_API_KEY) {
      const client = getOpenAIClient();
      const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      const resp = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: 'You are a precise information extractor. Return ONLY valid JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0,
        max_tokens: 400
      });
      const text = resp.choices?.[0]?.message?.content ?? '';
      const parsed = tryParseJSONArray(text);
      if (parsed.length) return parsed;
    }
  } catch {/* ignore and try gemini */}

  try {
    if (provider === 'gemini' || process.env.GEMINI_API_KEY) {
      const client = getGeminiClient();
      const model = client.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-1.5-pro-latest' });
      const res = await model.generateContent(prompt + "\n\nReturn ONLY JSON array.");
      const text = (await res.response).text();
      const parsed = tryParseJSONArray(text);
      if (parsed.length) return parsed;
    }
  } catch {/* ignore */}

  // Fallback: simple regex-based heuristics for name and timezone
  const out: ExtractedMemory[] = [];
  const mName = userMessage.match(/my name is\s+([A-Za-z][A-Za-z\-\s]{1,30})/i);
  if (mName) out.push({ key: 'name', value: mName[1].trim(), type: 'fact', confidence: 0.6 });
  const mTz = userMessage.match(/\b(gmt|utc|pst|pdt|est|edt|cst|cdt|mst|mdt)\b/i);
  if (mTz) out.push({ key: 'timezone', value: mTz[1].toUpperCase(), type: 'fact', confidence: 0.55 });
  return out;
}

