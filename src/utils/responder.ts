import { Message } from "discord.js";
import { generateReply } from "../services/openai";
import { localReply } from "../services/localResponder";

const conversations = new Map<string, string[]>();

export function isWakeWord(message: Message, wakeWord: string) {
  const content = message.content.toLowerCase();
  if (message.mentions.has(message.client.user!)) return true;
  if (content.includes(wakeWord.toLowerCase())) return true;
  return false;
}

export async function handleConversationalReply(message: Message) {
  const key = `${message.guild?.id ?? 'dm'}:${message.author.id}`;
  const convo = conversations.get(key) ?? [];
  convo.push(`User: ${message.content}`);
  // keep last 10 messages
  if (convo.length > 10) convo.splice(0, convo.length - 10);
  conversations.set(key, convo);

  const prompt = convo.join("\n") + "\nAssistant:";

  // Try AI (Gemini) first. If that fails, fallback to local responder.
  try {
    const reply = await generateReply(prompt);
    // add assistant reply to convo
    convo.push(`Assistant: ${reply}`);
    if (convo.length > 10) convo.splice(0, convo.length - 10);
    conversations.set(key, convo);
    await sendChunkedReply(message, reply);
    return;
  } catch (err: any) {
    console.warn("AI reply failed, falling back to local responder:", err?.message ?? err);
  }

  try {
    const local = await localReply(message, message.content);
    convo.push(`Assistant: ${local}`);
    if (convo.length > 10) convo.splice(0, convo.length - 10);
    conversations.set(key, convo);
    await sendChunkedReply(message, local);
  } catch (err) {
    console.error("Local reply error:", err);
    await message.reply("Sorry, I couldn't think of a reply right now.");
  }
}

// Discord hard limit: 2000 characters per message. Split and send gracefully.
function splitIntoDiscordChunks(text: string, max = 2000): string[] {
  if (!text) return [""];
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let remaining = text.trim();
  while (remaining.length > max) {
    // Try to split on double newlines, then single newlines, then period+space, else hard cut
    const slice = remaining.slice(0, max);
    let cut = Math.max(
      slice.lastIndexOf("\n\n"),
      slice.lastIndexOf("\n"),
      slice.lastIndexOf(". "),
      slice.lastIndexOf(" ")
    );
    if (cut < max * 0.6) {
      // not a great split point found; just hard cut at max
      cut = max;
    }
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining.length) chunks.push(remaining);
  return chunks.filter(Boolean);
}

async function sendChunkedReply(message: Message, text: string) {
  const chunks = splitIntoDiscordChunks(text, 2000);
  if (chunks.length === 0) return;
  // First chunk as a proper reply (mentions author); subsequent as follow-ups to avoid spam mentions
  await message.reply(chunks[0]);
  for (let i = 1; i < chunks.length; i++) {
    // @ts-ignore - channel union; treat as TextBasedChannel for send
    await (message.channel as any).send(chunks[i]);
  }
}
