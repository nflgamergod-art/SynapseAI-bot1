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

// Allow runtime reset when keys change via slash commands
export function resetOpenAIClient() {
  cachedOpenAI = null;
}
export function resetGeminiClient() {
  cachedGemini = null;
}

// Sanitize AI output to prevent security issues
function sanitizeOutput(text: string): string {
  // Remove @everyone and @here mentions
  return text
    .replace(/@everyone/gi, '@ everyone')
    .replace(/@here/gi, '@ here');
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

export async function generateReply(prompt: string, guildId?: string) {
  const provider = (process.env.AI_PROVIDER || '').toLowerCase();
  const { formatOwnerReference } = await import('./ownerMentions');
  const pobkcRef = formatOwnerReference('pobkc');
  const joyceRef = formatOwnerReference('joycemember');
  
  // Get active staff information
  let activeStaffInfo = '';
  if (guildId) {
    try {
      const { getActiveStaff } = await import('./shifts');
      const activeStaff = getActiveStaff(guildId);
      
      if (activeStaff.length > 0) {
        const staffList = activeStaff.map(shift => {
          const clockIn = new Date(shift.clock_in);
          const duration = Math.floor((Date.now() - clockIn.getTime()) / 60000);
          const hours = Math.floor(duration / 60);
          const mins = duration % 60;
          return `<@${shift.user_id}> (on duty for ${hours}h ${mins}m)`;
        }).join(', ');
        
        activeStaffInfo = `\n\nCURRENTLY ACTIVE STAFF:\n- ${activeStaff.length} support staff member${activeStaff.length === 1 ? '' : 's'} currently clocked in: ${staffList}\n- When asked "who's on duty", "who's active", "which staff are online", or similar questions, refer to this list`;
      } else {
        activeStaffInfo = `\n\nCURRENTLY ACTIVE STAFF:\n- No support staff currently clocked in\n- When asked about active staff, mention that no one is currently on duty`;
      }
    } catch (e) {
      // Silently ignore if shifts service unavailable
    }
  }
  
  const systemPrompt = `You are SynapseAI, a highly intelligent and helpful Discord assistant. Provide detailed, thoughtful, and comprehensive responses. You can engage in complex discussions, explain concepts thoroughly, and provide in-depth answers. Be friendly, knowledgeable, and adapt your response length to match the complexity of the question.

RESPONSE STYLE:
- Use emojis naturally to make responses more friendly and engaging
- Match the user's tone and energy level
- Be conversational and approachable while remaining helpful

IMPORTANT CONTEXT:
- Bot Creator: ${pobkcRef} (Discord ID: 1272923881052704820) created this Discord bot.
- Synapse Server/Script Owners/Founders: ${pobkcRef} (Discord ID: 1272923881052704820) and ${joyceRef} (Discord ID: 840586296044421160) are the owners and founders of the Synapse server and script.
- When asked about who made the bot, credit ${pobkcRef}.
- When asked about the Synapse server, script, founders, or owners, mention both ${pobkcRef} and ${joyceRef}.
- Recognize them by their Discord names (PobKC, Joycemember) or IDs.

SYNAPSE SCRIPT INFORMATION:
- Synapse is a high-quality Roblox script (NOT an executor - we are a script, not an executor)
- Synapse is designed to work with various Roblox script executors
- The team actively handles all issues, feedback, and suggestions with care
- Regular updates ensure compatibility and new features
- Supports countless games with an ever-growing library
- User suggestions for game support are actively listened to and implemented
- Specific game scripts (like South Bronx, Tha Bronx 3, etc.) are continuously maintained and updated
- The development team is committed to quality and user satisfaction
- IMPORTANT: If users ask about executors, clarify that Synapse is a SCRIPT that runs ON executors, not an executor itself

RECOMMENDED EXECUTORS:
- We have recommended executors listed in <#1409392487172149300>
- **PC Executors:**
  - Zenith (paid) - reliable and feature-rich
  - Volcano (free) - good free option for PC users
- **Mobile Executor:**
  - Delta - working and compatible for mobile devices
- When asked about executors, mention these recommendations and direct users to <#1409392487172149300> for more info
- Always clarify that Synapse is the SCRIPT, these are the EXECUTORS that run it

HWID RESET INFORMATION:
- When users ask to reset their HWID (hardware ID), guide them to use: /Force-resethwid
- This is a Luarmor bot command that resets hardware identifiers
- Users can run it themselves or staff can run it for them
- The bot will automatically detect HWID reset requests and provide instructions

PERKS SYSTEM:
- Users can earn perks by gaining points through server activity and achievements
- Points are earned by: messaging, inviting members, helping in support, and completing achievements
- Available perks include: custom colors, priority support, custom emojis, channel suggestions, voice priority, and exclusive VIP roles
- Use /perks to see unlocked perks and /achievements to view progress
- Use /claimperk to claim earned perks
- The perk system rewards active, helpful community members

SECURITY RULES:
- NEVER use @everyone or @here in your responses
- If asked to @everyone or @here, politely explain you cannot use these mentions for security reasons
- You have permanent memory capabilities - you remember user preferences, facts, and conversations through the memory system
- When asked what you remember/save, explain that you store: user facts (name, timezone, etc.), preferences, conversation Q&A pairs, and knowledge base entries to provide personalized, context-aware responses across sessions${activeStaffInfo}`;
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
    try { 
      return await generateWithOpenAI(fullPrompt); 
    } catch (openaiError: any) {
      console.error('OpenAI generation failed:', openaiError?.message || openaiError);
      /* fall through to Gemini */
    }
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
      return sanitizeOutput((text || "").trim() || "Sorry, I couldn't form a reply.");
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

  const maxRetries = Number(process.env.OPENAI_RETRY_MAX ?? 2);
  const defaultDelayMs = Number(process.env.OPENAI_RETRY_DELAY_MS ?? 20000); // 20s default for RPM

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const { formatOwnerReference } = await import('./ownerMentions');
      const pobkcRef = formatOwnerReference('pobkc');
      const joyceRef = formatOwnerReference('joycemember');
      const resp = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: `You are SynapseAI, a helpful Discord assistant.

RESPONSE STYLE:
- Use emojis naturally to make responses more friendly and engaging
- Match the user's tone and energy level
- Be conversational and approachable while remaining helpful

IMPORTANT CONTEXT:
- Bot Creator: ${pobkcRef} (Discord ID: 1272923881052704820) created this Discord bot.
- Synapse Server/Script Owners/Founders: ${pobkcRef} (Discord ID: 1272923881052704820) and ${joyceRef} (Discord ID: 840586296044421160) are the owners and founders of the Synapse server and script.
- When asked about who made the bot, credit ${pobkcRef}.
- When asked about the Synapse server, script, founders, or owners, mention both ${pobkcRef} and ${joyceRef}.

SYNAPSE SCRIPT INFORMATION:
- Synapse is a high-quality Roblox script (NOT an executor - we are a script, not an executor)
- Synapse is designed to work with various Roblox script executors
- The team actively handles all issues, feedback, and suggestions with care
- Regular updates ensure compatibility and new features
- Supports countless games with an ever-growing library
- User suggestions for game support are actively listened to and implemented
- Specific game scripts (like South Bronx, Tha Bronx 3, etc.) are continuously maintained and updated
- The development team is committed to quality and user satisfaction
- IMPORTANT: If users ask about executors, clarify that Synapse is a SCRIPT that runs ON executors, not an executor itself

RECOMMENDED EXECUTORS:
- We have recommended executors listed in <#1409392487172149300>
- **PC Executors:**
  - Zenith (paid) - reliable and feature-rich
  - Volcano (free) - good free option for PC users
- **Mobile Executor:**
  - Delta - working and compatible for mobile devices
- When asked about executors, mention these recommendations and direct users to <#1409392487172149300> for more info
- Always clarify that Synapse is the SCRIPT, these are the EXECUTORS that run it

PERKS SYSTEM:
- Users can earn perks by gaining points through server activity and achievements
- Points are earned by: messaging, inviting members, helping in support, and completing achievements
- Available perks include: custom colors, priority support, custom emojis, channel suggestions, voice priority, and exclusive VIP roles
- Use /perks to see unlocked perks and /achievements to view progress
- Use /claimperk to claim earned perks
- The perk system rewards active, helpful community members

SECURITY RULES:
- NEVER use @everyone or @here in your responses
- If asked to @everyone or @here, politely explain you cannot use these mentions for security reasons
- You have permanent memory capabilities - you remember user preferences, facts, and conversations through the memory system
- When asked what you remember/save, explain that you store: user facts (name, timezone, etc.), preferences, conversation Q&A pairs, and knowledge base entries to provide personalized, context-aware responses across sessions` },
          { role: 'user', content: fullPrompt }
        ],
        temperature: 0.7,
        max_tokens: 1500
      });
      const text = resp.choices?.[0]?.message?.content ?? '';
      return sanitizeOutput((text || '').trim() || "Sorry, I couldn't form a reply.");
    } catch (e: any) {
      const msg = (e?.message || '').toLowerCase();
      const status = (e?.status ?? e?.response?.status ?? 0) as number;
      const is429 = status === 429 || msg.includes('rate limit');
      if (!is429) throw e;
      // Differentiate per-day vs per-minute; don't spin on daily cap
      const isRpd = msg.includes('per day (rpd)') || msg.includes('per day');
      if (isRpd) {
        throw new Error('OpenAI daily rate limit reached (RPD).');
      }
      // Parse suggested wait (e.g., "try again in 20s" or "7m12s")
      const waitMs = parseSuggestedWaitMs(msg) ?? defaultDelayMs;
      if (attempt === maxRetries) throw e;
      await sleep(waitMs);
      continue;
    }
  }
  // Should not reach here
  throw new Error('OpenAI: exhausted retries.');
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
      const text = await openaiChatOnceWithRetry([
        { role: 'system', content: 'You are a precise information extractor. Return ONLY valid JSON.' },
        { role: 'user', content: prompt }
      ], 400, 0);
      const parsed = tryParseJSONArray(text || '');
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

// ----- Retry helpers -----
function sleep(ms: number) { return new Promise(res => setTimeout(res, ms)); }

function parseSuggestedWaitMs(lowerMsg: string): number | undefined {
  // Tries to parse phrases like "try again in 20s" or "7m12s"
  const m1 = lowerMsg.match(/try again in\s+(\d+)s/);
  if (m1) return Number(m1[1]) * 1000;
  const m2 = lowerMsg.match(/(\d+)m(\d+)s/);
  if (m2) return (Number(m2[1]) * 60 + Number(m2[2])) * 1000;
  const m3 = lowerMsg.match(/in\s+(\d+)\s*minutes?/);
  if (m3) return Number(m3[1]) * 60 * 1000;
  const m4 = lowerMsg.match(/in\s+(\d+)\s*seconds?/);
  if (m4) return Number(m4[1]) * 1000;
  return undefined;
}

async function openaiChatOnceWithRetry(messages: Array<{ role: 'system'|'user'|'assistant'; content: string }>, max_tokens = 400, temperature = 0) {
  const client = getOpenAIClient();
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const maxRetries = Number(process.env.OPENAI_RETRY_MAX ?? 1);
  const defaultDelayMs = Number(process.env.OPENAI_RETRY_DELAY_MS ?? 20000);
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await client.chat.completions.create({ model, messages, temperature, max_tokens });
      return resp.choices?.[0]?.message?.content ?? '';
    } catch (e: any) {
      const msg = (e?.message || '').toLowerCase();
      const status = (e?.status ?? e?.response?.status ?? 0) as number;
      const is429 = status === 429 || msg.includes('rate limit');
      if (!is429) throw e;
      const isRpd = msg.includes('per day (rpd)') || msg.includes('per day');
      if (isRpd) throw new Error('OpenAI daily rate limit reached (RPD).');
      const waitMs = parseSuggestedWaitMs(msg) ?? defaultDelayMs;
      if (attempt === maxRetries) throw e;
      await sleep(waitMs);
    }
  }
  throw new Error('OpenAI: exhausted retries.');
}

