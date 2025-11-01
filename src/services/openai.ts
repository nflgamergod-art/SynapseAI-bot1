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
  for (const modelName of GEMINI_MODEL_CANDIDATES) {
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
