import { Message } from "discord.js";
import { getWeather } from "./weatherApi";
import { findMatchingResponse, learnPattern, getRandomJoke } from "./learningService";
import { responseTracker } from "./responseTracker";
import { generateReply } from './openai';

const GREETINGS = ["hello", "hi", "hey", "yo", "sup", "greetings"];
const FAREWELLS = ["bye", "goodbye", "see ya", "see you", "catch you later", "take care"];

const HOW_ARE_YOU_RESPONSES = [
  "Making sure the Server is greater and making the weight lighter for team synapse!",
  "Running smoothly and keeping the server safe!",
  "Doing great, thanks for asking! Just processing some data and keeping things organized.",
  "Living my best digital life, helping out where I can!",
  "Operating at optimal efficiency and ready to assist!",
  "Fantastic! Love being here to help everyone out.",
  "Pretty good! Been busy keeping an eye on things and learning new stuff.",
];

const DEFAULT_FALLBACK = [
  "I'm not sure about that, but I can try to help!",
  "Can you tell me more about what you'd like to know?",
  "Interesting question! Could you be a bit more specific?",
  "I'm here to help! What exactly would you like to know?",
  "That's an interesting topic. Could you elaborate?"
];

// Small FAQ knowledge base
const FAQ_KB: Record<string, string> = {
  "how to invite": "To invite the bot, use the OAuth link with bot scope and give it required permissions (Send Messages, Moderate Members, Manage Roles).",
  "prefix": `The default command prefix is ${process.env.PREFIX ?? '!'} but you can also mention me or use slash commands.`,
  "help": `Use ${process.env.PREFIX ?? '!'}help to see available commands.`,
  "what can you do": "I can help with server moderation, answer questions, check the weather, and chat with you! Just ask me anything or use commands with the prefix.",
  "who are you": "I'm SynapseAI, your friendly Discord assistant! I help with moderation, answer questions, and try to make the server a better place.",
};

interface ReplyContext {
  text: string;
  username: string;
  userId: string;
}

async function generateResponse(t: string, username: string): Promise<string> {
  // Weather queries
  const weatherMatch = t.match(/(?:what'?s |how'?s |get |check )?(?:the )?weather(?: like)?(?: in | at | for )?(.*)/i);
  const location = weatherMatch?.[1]?.trim();
  if (location) {
    return await getWeather(location);
  }

  // How are you doing queries
  if (/how (?:are|r) (?:you|u)|how'?s it going|how you doing/i.test(t)) {
    return HOW_ARE_YOU_RESPONSES[Math.floor(Math.random() * HOW_ARE_YOU_RESPONSES.length)];
  }

  // Joke requests
  if (/tell (?:me )?(?:a )?joke/i.test(t)) {
    const joke = getRandomJoke();
    if (joke.setup) {
      return `${joke.setup}\n\n||${joke.punchline}||`;
    }
    return joke.punchline;
  }

  // Dad joke requests
  if (/tell (?:me )?(?:a )?dad joke/i.test(t)) {
    const joke = getRandomJoke('dad-joke');
    if (joke.setup) {
      return `${joke.setup}\n\n||${joke.punchline}||`;
    }
    return joke.punchline;
  }

  // direct FAQ lookup
  for (const key of Object.keys(FAQ_KB)) {
    if (t.includes(key)) return FAQ_KB[key];
  }

  // Greeting
  for (const g of GREETINGS) {
    const re = new RegExp(`\\b${escapeRegex(g)}\\b`, "i");
    if (re.test(t) && t.length < 40) {
      const responses = [
        `${capitalize(g)} ${username}! How can I help you today?`,
        `${capitalize(g)}! Great to see you, ${username}!`,
        `${capitalize(g)} there, ${username}! Need any assistance?`,
        `${capitalize(g)}! Hope you're having a fantastic day, ${username}!`
      ];
      return responses[Math.floor(Math.random() * responses.length)];
    }
  }

  // Farewell
  for (const f of FAREWELLS) {
    const re = new RegExp(`\\b${escapeRegex(f)}\\b`, "i");
    if (re.test(t)) {
      const responses = [
        `Goodbye ${username}! Have a great day!`,
        `See you later, ${username}! Stay awesome!`,
        `Take care, ${username}! Come back soon!`,
        `Catch you later, ${username}! Keep being amazing!`
      ];
      return responses[Math.floor(Math.random() * responses.length)];
    }
  }

  // Polite responses
  if (/thank(s| you)/i.test(t)) {
    const responses = [
      `You're welcome, ${username}!`,
      `Anytime, ${username}! Happy to help!`,
      `No problem at all, ${username}!`,
      `My pleasure, ${username}! Let me know if you need anything else!`
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }

  // Learning from user responses
  const learnMatch = t.match(/^learn:?\s*"([^"]+)"\s*=>\s*"([^"]+)"/i);
  if (learnMatch?.[1] && learnMatch?.[2]) {
    const pattern = learnMatch[1];
    const response = learnMatch[2];
    learnPattern(pattern, response, username);
    return `Thanks! I learned that "${pattern}" should get the response "${response}"`;
  }

  // Check for learned responses before falling back
  const learned = findMatchingResponse(t);
  if (learned !== undefined) {
    return learned;
  }

  // Simple question detection
  if (t.endsWith("?") || /^who\b|^what\b|^how\b|^why\b|^when\b/.test(t)) {
    return DEFAULT_FALLBACK[Math.floor(Math.random() * DEFAULT_FALLBACK.length)];
  }

  // Mentions of the bot wake word - try to be more intelligent about responses
  if (t.includes((process.env.WAKE_WORD ?? "synapseai").toLowerCase())) {
    // If it's clearly a question, try to answer it rather than giving generic greeting
    if (t.includes("?") || /\b(what|how|why|when|where|who|can you|tell me|explain)\b/.test(t)) {
      // Let it fall through to default fallback for questions
    } else {
      return `Hey ${username}! I'm SynapseAI — your friendly server assistant. I can help with moderation, answer questions, check weather, and chat! Try \`${process.env.PREFIX ?? '!'}help\` for commands or just ask me anything.`;
    }
  }

  // Default
  return DEFAULT_FALLBACK[Math.floor(Math.random() * DEFAULT_FALLBACK.length)];
}

export async function localReplyText({ text, username = "there", userId }: ReplyContext): Promise<string> {
  const t = (text ?? "").toLowerCase().trim();
  
  // Generate the base response
  const response = await generateResponse(t, username);
  
  // Track the question and get tracking response
  const trackingResult = await responseTracker.trackQuestion(t, userId, username, response);
  
  if (!trackingResult.shouldRespond) {
    // User asked the same question too soon
    return trackingResult.customResponse!;
  }
  
  if (trackingResult.customResponse) {
    // Someone else asked this recently
    return `${trackingResult.customResponse}\n\n${trackingResult.originalResponse}`;
  }
  
  return response;
}

export async function localReply(message: Message, prompt?: string) {
  const text = prompt ?? message.content ?? "";
  const reply = await localReplyText({
    text,
    username: message.author?.username ?? "there",
    userId: message.author.id
  });
  return reply;
}

// Add logic to handle replies to the bot's messages
export async function handleReply(message: Message): Promise<boolean> {
  console.log(`[handleReply] Received message: ${message.content}`);
  if (message.reference?.messageId) {
    const repliedTo = await message.channel.messages.fetch(message.reference.messageId);
    console.log(`[handleReply] Replying to message ID: ${repliedTo.id}, Author: ${repliedTo.author.username}`);
    if (repliedTo.author.id === message.client.user?.id) {
      try {
        const response = await generateReply(message.content, message.guild?.id);
        console.log(`[handleReply] Generated response: ${response}`);
        await message.reply(response);
        return true; // Indicate that a response was sent
      } catch (error) {
        console.error('[handleReply] Error generating response:', error);
      }
    }
  }
  return false; // Indicate that no response was sent
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}