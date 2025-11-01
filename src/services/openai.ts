import { GoogleGenerativeAI } from "@google/generative-ai";

let cachedClient: GoogleGenerativeAI | null = null;

function getGeminiClient(): GoogleGenerativeAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Gemini API key not configured");
  if (!cachedClient) cachedClient = new GoogleGenerativeAI(key);
  return cachedClient;
}

const MODEL_CANDIDATES = [
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
  const client = getGeminiClient();
  const systemPrompt = "You are SynapseAI, a highly intelligent and helpful Discord assistant. Provide detailed, thoughtful, and comprehensive responses. You can engage in complex discussions, explain concepts thoroughly, and provide in-depth answers. Be friendly, knowledgeable, and adapt your response length to match the complexity of the question.";
  const fullPrompt = `${systemPrompt}\n\nUser: ${prompt}\nAssistant:`;

  let lastErr: any = null;
  for (const modelName of MODEL_CANDIDATES) {
    try {
      const model = client.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(fullPrompt);
      const response = await result.response;
      const text = response.text();
      return (text || "").trim() || "Sorry, I couldn't form a reply.";
    } catch (e: any) {
      lastErr = e;
      const msg = (e?.message || "").toLowerCase();
      // Try next model on typical not found/unsupported errors
      if (msg.includes("not found") || msg.includes("is not supported") || msg.includes("404")) {
        continue;
      }
      // Otherwise, break and throw
      break;
    }
  }
  throw lastErr || new Error("Gemini generateContent failed");
}
