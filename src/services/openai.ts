import OpenAI from "openai";

let cachedClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OpenAI API key not configured");
  if (!cachedClient) cachedClient = new OpenAI({ apiKey: key });
  return cachedClient;
}

export async function generateReply(prompt: string) {
  const client = getOpenAIClient();

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are SynapseAI, a highly intelligent and helpful Discord assistant. Provide detailed, thoughtful, and comprehensive responses. You can engage in complex discussions, explain concepts thoroughly, and provide in-depth answers. Be friendly, knowledgeable, and adapt your response length to match the complexity of the question." },
      { role: "user", content: prompt }
    ],
    max_tokens: 1500,
    temperature: 0.8
  });

  const text = response.choices?.[0]?.message?.content ?? "Sorry, I couldn't form a reply.";
  return text.trim();
}
