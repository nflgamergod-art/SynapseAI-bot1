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

// Auto-save valuable Q&A to knowledge base
async function autoSaveToKnowledgeBase(message: Message, reply: string, guildId: string | null) {
  // Heuristics to determine if Q&A is worth saving to KB:
  // 1. Question contains "how", "what", "why", "when", "where", "who"
  // 2. Reply is substantial (> 50 characters)
  // 3. Not already in KB (check for similar)
  
  const question = message.content.toLowerCase();
  const isQuestion = /\b(how|what|why|when|where|who|can|should|is|are|do|does)\b/i.test(question);
  const hasQuestionMark = question.includes('?');
  const isSubstantialReply = reply.length > 50;
  
  if ((isQuestion || hasQuestionMark) && isSubstantialReply) {
    const { findSimilarQuestions, addKnowledgeEntry } = await import('../services/preventiveSupport');
    const similar = findSimilarQuestions(guildId, message.content, 0.7);
    
    // Only save if not too similar to existing entries
    if (similar.length === 0) {
      // Categorize based on content
      let category = 'general';
      if (/\b(error|crash|bug|broken|fix)\b/i.test(question)) category = 'technical';
      else if (/\b(how to|tutorial|guide|setup)\b/i.test(question)) category = 'tutorial';
      else if (/\b(synapse|script|roblox)\b/i.test(question)) category = 'synapse';
      else if (/\b(perk|point|achievement|reward)\b/i.test(question)) category = 'features';
      
      // Extract tags from question
      const tags = question.match(/\b\w{4,}\b/g)?.slice(0, 5) || [];
      
      addKnowledgeEntry({
        guildId,
        category,
        question: message.content,
        answer: reply,
        tags,
        sourceMessageId: message.id,
        addedBy: 'auto-learner'
      });
      
      console.log(`📚 Auto-saved to KB: "${message.content.slice(0, 50)}..."`);
    }
  }
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

  // Check if user is asking about specific saved information
  const { getMemoryByKey } = await import('../services/memory');
  const lowerContent = message.content.toLowerCase();
  
  let directAnswerContext: string | undefined;
  
  // Direct question patterns - check for saved info first
  const directQuestions: { pattern: RegExp; keys: string[] }[] = [
    // Personal Information
    { pattern: /what'?s my (birthday|bday|birth date)/i, keys: ['birthday'] },
    { pattern: /when is my (birthday|bday)/i, keys: ['birthday'] },
    { pattern: /what'?s my (name|full name)/i, keys: ['name'] },
    { pattern: /how old am i|what'?s my age/i, keys: ['age'] },
    { pattern: /where (do i live|am i from|is my location)/i, keys: ['location'] },
    { pattern: /what'?s my (timezone|time zone)/i, keys: ['timezone'] },
    
    // Occupation & Education
    { pattern: /what'?s my (job|occupation|work|career)/i, keys: ['occupation', 'job_title', 'company'] },
    { pattern: /where do i work|what company/i, keys: ['company', 'job_title'] },
    { pattern: /what'?s my (major|degree|field of study)/i, keys: ['major', 'school'] },
    { pattern: /what school|where do i study/i, keys: ['school', 'major'] },
    
    // Family & Pets
    { pattern: /what'?s my (spouse|partner|wife|husband)'?s? name/i, keys: ['spouse_name', 'partner_name'] },
    { pattern: /what are my (kids|children)'?s? names?/i, keys: ['kids_names', 'children_names'] },
    { pattern: /what (pets|pet) do i have/i, keys: ['pet_name', 'pet_type'] },
    { pattern: /what'?s my (pet|dog|cat)'?s? name/i, keys: ['pet_name', 'pet_type'] },
    
    // Interests & Hobbies
    { pattern: /what'?s my (favorite|fav) (team|game|food|music|book|movie|show)/i, keys: ['favorite_team', 'favorite_game', 'favorite_food', 'favorite_music', 'favorite_book', 'favorite_movie'] },
    { pattern: /what are my (hobbies|interests)/i, keys: ['hobbies', 'interests'] },
    { pattern: /what do i like|what are my likes/i, keys: ['likes', 'interests', 'hobbies'] },
    { pattern: /what do i dislike|what are my dislikes/i, keys: ['dislikes'] },
    
    // Tech & Projects
    { pattern: /what (programming |coding )?languages? do i know/i, keys: ['programming_languages', 'languages_known'] },
    { pattern: /what'?s my (tech stack|stack|frameworks?)/i, keys: ['tech_stack', 'frameworks'] },
    { pattern: /what (projects?|am i (working|building) on)/i, keys: ['current_project', 'projects'] },
    { pattern: /what'?s my (favorite |preferred )?(code )?editor/i, keys: ['favorite_editor', 'code_editor'] },
    
    // Goals & Learning
    { pattern: /what am i (learning|studying)/i, keys: ['learning_goals', 'currently_learning', 'major'] },
    { pattern: /what are my (career |personal )?goals?/i, keys: ['career_goals', 'personal_goals', 'goals'] },
    { pattern: /what'?s my (dream location|dream place|where do i want to (live|go|visit))/i, keys: ['dream_location', 'travel_goals'] },
    
    // Preferences
    { pattern: /what are my (dietary restrictions|allergies)/i, keys: ['dietary_restrictions', 'allergies'] },
    { pattern: /am i (allergic|vegetarian|vegan)/i, keys: ['allergies', 'dietary_restrictions'] },
    
    // Schedule & Contact
    { pattern: /what are my (work hours|working hours|availability)/i, keys: ['work_hours', 'availability'] },
    { pattern: /when am i (available|free)/i, keys: ['availability', 'work_hours'] },
    { pattern: /what'?s my (email|phone|contact)/i, keys: ['email', 'phone'] },
    { pattern: /what'?s my (twitter|instagram|github|linkedin|social media)/i, keys: ['twitter', 'instagram', 'github', 'linkedin', 'social_media'] },
  ];
  
  for (const { pattern, keys } of directQuestions) {
    if (pattern.test(lowerContent)) {
      console.log(`[Direct Question] Pattern matched: ${pattern}, checking keys: ${keys.join(', ')}`);
      let foundInfo = '';
      for (const key of keys) {
        const memory = getMemoryByKey(message.author.id, key, guildId);
        console.log(`[Direct Question] Checked key "${key}": ${memory ? `FOUND - ${memory.value}` : 'NOT FOUND'}`);
        if (memory) {
          foundInfo += `${memory.key}: ${memory.value}\n`;
        }
      }
      
      if (foundInfo) {
        // User is asking about info we have - make sure AI sees it clearly
        directAnswerContext = `\n🔍 DIRECT QUESTION DETECTED - User is asking about their own information that you HAVE SAVED:\n${foundInfo}\nYou MUST share this information with them! Don't say you don't have it!\n\n`;
        console.log(`[Direct Question] Added context to AI: ${directAnswerContext}`);
      } else {
        console.log(`[Direct Question] Pattern matched but no saved info found for any of the keys`);
      }
      break;
    }
  }

  // Fetch relevant long-term memories and prior Q&A
  const relevant = findRelevantMemories(message.content, message.author.id, guildId, 5);
  const similar = findSimilarQA(message.content, message.author.id, guildId);
  let memoryContext = '';
  
  // CRITICAL: Always include user's Discord username/tag as primary identifier
  memoryContext += `User Info (ALWAYS REFERENCE THIS):\n- Discord Username: ${message.author.username}\n- Discord User ID: ${message.author.id}\n- Discord Tag: ${message.author.tag}\n\n`;
  
  // Add direct answer context if detected
  if (typeof directAnswerContext !== 'undefined') {
    memoryContext += directAnswerContext;
  }
  
  if (relevant.length) {
    const lines = relevant.map(m => `- (${m.type}) ${m.key}: ${m.value}`);
    memoryContext += `Known user facts/preferences (from past interactions with THIS user ${message.author.username}):\n${lines.join('\n')}\n\n`;
  }
  if (similar) {
    memoryContext += `Previously, when THIS user (${message.author.username}) asked a similar question, your answer was: "${similar.answer}". You may reference or improve upon it if still accurate.\n\n`;
  }

  // Add enhanced context from new features
  try {
    const { getFullUserContext } = await import('../services/enhancedIntegration');
    const { searchKnowledge } = await import('../services/preventiveSupport');
    const { getUserAchievements } = await import('../services/rewards');
    const { searchAnnouncements } = await import('../services/announcements');
    
    const enhancedData = getFullUserContext(message.author.id, guildId);
    
    // Add sentiment/emotional context
    if (enhancedData.sentimentTrend && enhancedData.sentimentTrend.overallMood) {
      const mood = enhancedData.sentimentTrend.overallMood;
      if (mood === 'very_negative' || mood === 'negative') {
        memoryContext += `User seems frustrated/negative - be empathetic and helpful\n`;
      } else if (mood === 'very_positive' || mood === 'positive') {
        memoryContext += `User is in a good mood - feel free to be cheerful\n`;
      }
    }
    
    // Add temporal activity patterns
    if (enhancedData.activityPrediction && enhancedData.activityPrediction.likelyActive) {
      memoryContext += `User is typically active at this time\n`;
    }
    
    // Search knowledge base for relevant FAQs
    const kbResults = searchKnowledge(guildId, message.content, 2);
    if (kbResults.length > 0) {
      const kbAnswers = kbResults.map(k => 
        `Q: ${k.question}\nA: ${k.answer}`
      ).join('\n\n');
      memoryContext += `Relevant knowledge base entries:\n${kbAnswers}\n\n`;
    }
    
    // Search for relevant announcements from owner
    const announcements = searchAnnouncements(guildId || '', message.content, 3);
    if (announcements.length > 0) {
      const announcementInfo = announcements.map(a => 
        `[${a.category.toUpperCase()}] ${a.title}:\n${a.content}`
      ).join('\n\n');
      memoryContext += `\n📢 IMPORTANT OWNER ANNOUNCEMENTS (Reference these when relevant):\n${announcementInfo}\n\n`;
    }
    
    // Check for recent achievements
    const achievements = getUserAchievements(message.author.id, guildId);
    const recentAchievements = achievements.filter((a: any) => {
      const awardedTime = new Date(a.awarded_at).getTime();
      const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
      return awardedTime > dayAgo;
    });
    if (recentAchievements.length > 0) {
      const achievementNames = recentAchievements.map((a: any) => a.achievement_name).join(', ');
      memoryContext += `User recently earned achievements: ${achievementNames} (you can congratulate them!)\n`;
    }
    
    // Add point total if significant
    if (enhancedData.totalPoints > 0) {
      memoryContext += `User has ${enhancedData.totalPoints} points\n`;
    }
  } catch (err) {
    // Enhanced context is optional, continue without it
    console.warn('Could not fetch enhanced context:', err);
  }

  const prompt = memoryContext + convo.join("\n") + "\nAssistant:";

  // Try AI (Gemini) first. If that fails, fallback to local responder.
  try {
    const reply = await generateReply(prompt, guildId || undefined);
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
    
    // Auto-save to knowledge base if it seems like a valuable Q&A
    try {
      await autoSaveToKnowledgeBase(message, reply, guildId);
    } catch (err) {
      console.warn('Auto KB save failed:', err);
    }
    
    const corrCtx = detectCorrectionContext(message.channel.id, message.createdTimestamp);
    
    // Check if owner is correcting the bot about someone else's name
    const ownerCorrectionRe = /(that'?s not|that isn'?t|wrong|incorrect|no,?\s+that'?s)\s+(?:my|someone else|another|not me|not my name)/i;
    const mentionsOtherUser = message.mentions.users.size > 0 && !message.mentions.has(message.client.user!);
    
    if (ownerCorrectionRe.test(message.content) && !events.some(e => e.key.toLowerCase() === 'name' && e.action === 'updated')) {
      // Owner is correcting but no name was extracted yet - ask the other user
      const finalReply = `${reply}\n\n🤔 I apologize for the mix-up! Could you please tell me your correct name so I can update my records?`;
      await sendChunkedReply(message, finalReply);
      return;
    }
    
    // Handle "that's correct but" additions - save to knowledge base
    if (corrCtx.isAddition && corrCtx.callOutMsg) {
      try {
        const { addKnowledgeEntry } = await import('../services/preventiveSupport');
        
        // Determine category based on content
        let category = 'general';
        const content = message.content.toLowerCase();
        if (/\b(executor|zenith|volcano|delta|synapse x|krnl)\b/i.test(content)) category = 'executors';
        else if (/\b(error|crash|bug|broken|fix)\b/i.test(content)) category = 'technical';
        else if (/\b(how to|tutorial|guide|setup)\b/i.test(content)) category = 'tutorial';
        else if (/\b(synapse|script|roblox)\b/i.test(content)) category = 'synapse';
        
        // Extract the addition part (after "but")
        const additionMatch = message.content.match(/but\s+(.+)/i);
        const addition = additionMatch ? additionMatch[1] : message.content;
        
        addKnowledgeEntry({
          guildId,
          category,
          question: `Additional info: ${addition.slice(0, 100)}`,
          answer: addition,
          tags: content.match(/\b(executor|zenith|volcano|delta|mobile|pc|free|paid)\b/gi) || [],
          sourceMessageId: message.id,
          addedBy: message.author.id
        });
        
        console.log(`📝 Saved user addition to KB: "${addition.slice(0, 50)}..."`);
      } catch (err) {
        console.warn('Failed to save addition to KB:', err);
      }
    }
    
    const ack = buildMemoryAck(message.content, events, corrCtx.isCorrectionContext);
    const finalReply = ack ? `${reply}\n\n${ack}` : reply;
    console.log(`[handleConversationalReply] About to send AI reply, length: ${finalReply.length}`);
    await sendChunkedReply(message, finalReply);
    console.log(`[handleConversationalReply] AI reply sent successfully, RETURNING NOW`);
    return;
  } catch (err: any) {
    console.error("[handleConversationalReply] AI reply FAILED! Error:", err?.message ?? err);
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
    
    // Auto-save to knowledge base for local responses too
    try {
      await autoSaveToKnowledgeBase(message, local, guildId);
    } catch (err) {
      console.warn('Auto KB save failed:', err);
    }
    
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
  const liarRe = /(lying|liar|that's not true|cap|capping|stop capping|that'?s not|that isn'?t|wrong|incorrect|not (my|their|his|her) name)/i;
  const correctionRe = /(actually|no,?\s|nope,?\s|false|incorrect|that'?s wrong)/i;
  const isCorrection = liarRe.test(userMessage) || correctionRe.test(userMessage) || isCorrectionContext;
  
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
      if (isCorrection && k === 'name') lines.push(`My apologies for the confusion! I've corrected my records — ${e.oldValue} → ${e.newValue}.`);
      else if (isCorrection) lines.push(`Sorry for the error! Correcting my notes: ${k} → ${e.newValue}.`);
      else if (k === 'name') lines.push(`Thanks for the update — your name is now ${e.newValue}.`);
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
