import { Message } from "discord.js";
import { generateReply } from "../services/openai";
import { findRelevantMemories, extractAndSaveFromExchange, upsertQAPair, findSimilarQA, trackRecentMessage, detectCorrectionContext } from "../services/memory";
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

  // Track message for correction detection
  const guildId = message.guild?.id ?? null;
  trackRecentMessage(message.author.id, guildId, message.channel.id, message.id, message.content);

  // Fetch relevant long-term memories and prior Q&A
  const relevant = findRelevantMemories(message.content, message.author.id, guildId, 5);
  const similar = findSimilarQA(message.content, message.author.id, guildId);
  let memoryContext = '';
  if (relevant.length) {
    const lines = relevant.map(m => `- (${m.type}) ${m.key}: ${m.value}`);
    memoryContext += `Known user facts/preferences (from past interactions):\n${lines.join('\n')}\n\n`;
  }
  if (similar) {
    memoryContext += `Previously, when asked a similar question, your answer was: "${similar.answer}". You may reference or improve upon it if still accurate.\n\n`;
  }

  const prompt = memoryContext + convo.join("\n") + "\nAssistant:";

  // Try AI (Gemini) first. If that fails, fallback to local responder.
  try {
    const reply = await generateReply(prompt);
    // add assistant reply to convo
    convo.push(`Assistant: ${reply}`);
    if (convo.length > 10) convo.splice(0, convo.length - 10);
    conversations.set(key, convo);
    // Persist memories and Q&A before sending so we can acknowledge in the same message
    const events = await extractAndSaveFromExchange({
      userId: message.author.id,
      guildId,
      sourceMsgId: message.id,
      userMessage: message.content,
      assistantMessage: reply
    });
    upsertQAPair(message.author.id, guildId, message.content, reply);
    const corrCtx = detectCorrectionContext(message.channel.id, message.createdTimestamp);
    const ack = buildMemoryAck(message.content, events, corrCtx.isCorrectionContext);
    const finalReply = ack ? `${reply}\n\n${ack}` : reply;
    await sendChunkedReply(message, finalReply);
    return;
  } catch (err: any) {
    console.warn("AI reply failed, falling back to local responder:", err?.message ?? err);
  }

  try {
    const local = await localReply(message, message.content);
    convo.push(`Assistant: ${local}`);
    if (convo.length > 10) convo.splice(0, convo.length - 10);
    conversations.set(key, convo);
    // Capture memories/Q&A from local responder too (prior to sending to include ack)
    const events = await extractAndSaveFromExchange({
      userId: message.author.id,
      guildId,
      sourceMsgId: message.id,
      userMessage: message.content,
      assistantMessage: local
    });
    upsertQAPair(message.author.id, guildId, message.content, local);
    const corrCtx = detectCorrectionContext(message.channel.id, message.createdTimestamp);
    const ack = buildMemoryAck(message.content, events, corrCtx.isCorrectionContext);
    const finalLocal = ack ? `${local}\n\n${ack}` : local;
    await sendChunkedReply(message, finalLocal);
  } catch (err) {
    console.error("Local reply error:", err);
    await message.reply("Sorry, I couldn't think of a reply right now.");
  }
}

function buildMemoryAck(userMessage: string, events: Array<{ key: string; action: string; oldValue?: string; newValue: string }>, isCorrectionContext: boolean): string {
  if (!events || !events.length) return '';
  const liarRe = /(lying|liar|that's not true|cap|capping|stop capping)/i;
  const lines: string[] = [];
  const maxLines = 2;
  for (const e of events) {
    if (lines.length >= maxLines) break;
    const k = e.key.toLowerCase();
    if (e.action === 'duplicate') continue;
    if (e.action === 'created') {
      if (k === 'name') lines.push(`Nice to meet you — I'll remember your name as ${e.newValue}.`);
      else if (k === 'timezone') lines.push(`Noted your timezone: ${e.newValue}.`);
      else if (k === 'favorite_team') lines.push(`Logged your favorite team: ${e.newValue}.`);
      else lines.push(`Got it — saved ${k}: ${e.newValue}.`);
    } else if (e.action === 'aliased') {
      if (k === 'name') lines.push(`Got it — I'll use ${e.newValue} and remember ${e.oldValue} as an alternate spelling.`);
      else lines.push(`Saved an alternate for ${k}.`);
    } else if (e.action === 'updated') {
      if (liarRe.test(userMessage) || isCorrectionContext) lines.push(`Caught in 4K — updating my notes: ${k} → ${e.newValue}.`);
      else if (k === 'name') lines.push(`Thanks for the correction — updating your name to ${e.newValue}.`);
      else lines.push(`Updated ${k} to ${e.newValue}.`);
    }
  }
  return lines.join(' ');
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
