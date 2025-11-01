import { GoogleGenerativeAI } from "@google/generative-ai";

let cachedClient: GoogleGenerativeAI | null = null;

function getGeminiClient(): GoogleGenerativeAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Gemini API key not configured");
  if (!cachedClient) cachedClient = new GoogleGenerativeAI(key);
  return cachedClient;
}

export async function generateReply(prompt: string) {
  const client = getGeminiClient();
  const model = client.getGenerativeModel({ model: "gemini-1.5-flash" });

  const systemPrompt = "You are SynapseAI, a highly intelligent and helpful Discord assistant. Provide detailed, thoughtful, and comprehensive responses. You can engage in complex discussions, explain concepts thoroughly, and provide in-depth answers. Be friendly, knowledgeable, and adapt your response length to match the complexity of the question.";
  
  const fullPrompt = `${systemPrompt}\n\nUser: ${prompt}\nAssistant:`;

  const result = await model.generateContent(fullPrompt);
  const response = await result.response;
  const text = response.text();
  
  return text.trim() || "Sorry, I couldn't form a reply.";
}
