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

  // Try OpenAI first (if configured). If that fails, fallback to local responder.
  try {
    const reply = await generateReply(prompt);
    // add assistant reply to convo
    convo.push(`Assistant: ${reply}`);
    if (convo.length > 10) convo.splice(0, convo.length - 10);
    conversations.set(key, convo);
    await message.reply(reply);
    return;
  } catch (err: any) {
    console.warn("OpenAI reply failed, falling back to local responder:", err?.message ?? err);
  }

  try {
    const local = await localReply(message, message.content);
    convo.push(`Assistant: ${local}`);
    if (convo.length > 10) convo.splice(0, convo.length - 10);
    conversations.set(key, convo);
    await message.reply(local);
  } catch (err) {
    console.error("Local reply error:", err);
    await message.reply("Sorry, I couldn't think of a reply right now.");
  }
}
