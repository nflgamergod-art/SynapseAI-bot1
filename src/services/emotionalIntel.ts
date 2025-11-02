import { getDB } from './db';

/**
 * Emotional Intelligence Layer
 * Features:
 * - Sentiment analysis
 * - Frustration detection
 * - Tone adjustment recommendations
 * - Escalation alerts
 * - Celebration detection
 */

function nowISO() {
  return new Date().toISOString();
}

export type Sentiment = 'very_negative' | 'negative' | 'neutral' | 'positive' | 'very_positive';

// Analyze sentiment of a message
export function analyzeSentiment(text: string): {
  sentiment: Sentiment;
  confidence: number;
  emotionalMarkers: string[];
} {
  const normalizedText = text.toLowerCase();
  
  const emotionalMarkers: string[] = [];
  let score = 0;
  
  // Positive indicators
  const positiveWords = ['thank', 'thanks', 'great', 'awesome', 'love', 'perfect', 'excellent', 'amazing', 'helpful', 'appreciate', 'wonderful', '😊', '👍', '❤️', '🎉'];
  const negativeWords = ['hate', 'terrible', 'awful', 'bad', 'worst', 'stupid', 'suck', 'frustrated', 'angry', 'annoyed', 'useless', 'broken', '😡', '😠', '😤'];
  const frustrationWords = ['still', 'again', 'why', 'how long', 'not working', "doesn't work", "can't", 'impossible', 'give up'];
  
  for (const word of positiveWords) {
    if (normalizedText.includes(word)) {
      score += 1;
      emotionalMarkers.push(`positive:${word}`);
    }
  }
  
  for (const word of negativeWords) {
    if (normalizedText.includes(word)) {
      score -= 1.5;
      emotionalMarkers.push(`negative:${word}`);
    }
  }
  
  for (const word of frustrationWords) {
    if (normalizedText.includes(word)) {
      score -= 0.5;
      emotionalMarkers.push(`frustration:${word}`);
    }
  }
  
  // Exclamation marks (can be positive or negative depending on context)
  const exclamations = (text.match(/!/g) || []).length;
  if (exclamations > 2) {
    emotionalMarkers.push(`intensity:${exclamations}_exclamations`);
    score += score > 0 ? 0.5 : -0.5; // Amplify existing sentiment
  }
  
  // Caps lock (usually negative/frustrated)
  const capsRatio = (text.match(/[A-Z]/g) || []).length / text.length;
  if (capsRatio > 0.5 && text.length > 10) {
    score -= 1;
    emotionalMarkers.push('intensity:caps_lock');
  }
  
  // Determine sentiment
  let sentiment: Sentiment;
  if (score <= -2) sentiment = 'very_negative';
  else if (score < 0) sentiment = 'negative';
  else if (score === 0) sentiment = 'neutral';
  else if (score < 2) sentiment = 'positive';
  else sentiment = 'very_positive';
  
  const confidence = Math.min(Math.abs(score) * 0.2, 0.95);
  
  return { sentiment, confidence, emotionalMarkers };
}

// Track sentiment history
export function trackSentiment(opts: {
  userId: string;
  guildId: string | null;
  channelId: string;
  messageId: string;
  sentiment: Sentiment;
  confidence: number;
  emotionalMarkers: string[];
  context?: string;
}) {
  const { userId, guildId, channelId, messageId, sentiment, confidence, emotionalMarkers, context } = opts;
  const db = getDB();
  const now = nowISO();
  
  db.prepare(`
    INSERT INTO sentiment_history
    (user_id, guild_id, channel_id, message_id, sentiment, confidence, emotional_markers, context, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, guildId, channelId, messageId, sentiment, confidence, JSON.stringify(emotionalMarkers), context || null, now);
}

// Get user's recent sentiment trend
export function getSentimentTrend(userId: string, guildId: string | null, hours = 24): {
  averageSentiment: number;
  trend: 'improving' | 'declining' | 'stable';
  recentSentiments: Sentiment[];
  frustrationLevel: number;
} {
  const db = getDB();
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  
  const sentiments = db.prepare(`
    SELECT sentiment, created_at
    FROM sentiment_history
    WHERE user_id = ? AND guild_id = ? AND created_at > ?
    ORDER BY created_at DESC
    LIMIT 20
  `).all(userId, guildId, since) as { sentiment: Sentiment; created_at: string }[];
  
  if (sentiments.length === 0) {
    return { averageSentiment: 0, trend: 'stable', recentSentiments: [], frustrationLevel: 0 };
  }
  
  // Map sentiment to numeric values
  const sentimentValues: Record<Sentiment, number> = {
    very_negative: -2,
    negative: -1,
    neutral: 0,
    positive: 1,
    very_positive: 2
  };
  
  const values = sentiments.map(s => sentimentValues[s.sentiment]);
  const averageSentiment = values.reduce((a, b) => a + b, 0) / values.length;
  
  // Check trend (compare first half vs second half)
  const mid = Math.floor(values.length / 2);
  const recentAvg = values.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
  const olderAvg = values.slice(mid).reduce((a, b) => a + b, 0) / (values.length - mid);
  
  let trend: 'improving' | 'declining' | 'stable';
  if (recentAvg > olderAvg + 0.3) trend = 'improving';
  else if (recentAvg < olderAvg - 0.3) trend = 'declining';
  else trend = 'stable';
  
  // Frustration level (negative sentiments in a row)
  let consecutiveNegative = 0;
  for (const s of sentiments) {
    if (sentimentValues[s.sentiment] < 0) {
      consecutiveNegative++;
    } else {
      break;
    }
  }
  const frustrationLevel = Math.min(consecutiveNegative / 3, 1); // 0-1 scale
  
  return {
    averageSentiment,
    trend,
    recentSentiments: sentiments.map(s => s.sentiment),
    frustrationLevel
  };
}

// Suggest tone adjustment based on user's emotional state
export function suggestToneAdjustment(userId: string, guildId: string | null): {
  suggestedTone: string;
  reasoning: string;
  shouldEscalate: boolean;
} {
  const trend = getSentimentTrend(userId, guildId, 2); // Last 2 hours
  
  if (trend.frustrationLevel > 0.6) {
    return {
      suggestedTone: 'empathetic_urgent',
      reasoning: 'User shows high frustration - use empathetic tone and consider escalation',
      shouldEscalate: trend.frustrationLevel > 0.8
    };
  }
  
  if (trend.averageSentiment < -0.5) {
    return {
      suggestedTone: 'supportive',
      reasoning: 'User sentiment is negative - be extra supportive and patient',
      shouldEscalate: false
    };
  }
  
  if (trend.averageSentiment > 0.5) {
    return {
      suggestedTone: 'friendly_enthusiastic',
      reasoning: 'User is in good mood - match their positive energy',
      shouldEscalate: false
    };
  }
  
  return {
    suggestedTone: 'professional_neutral',
    reasoning: 'User sentiment is neutral - maintain professional helpful tone',
    shouldEscalate: false
  };
}

// Detect if user achieved something worth celebrating
export function detectCelebration(text: string): { celebrate: boolean; achievementType?: string } {
  const normalizedText = text.toLowerCase();
  
  const celebrationPhrases = [
    { phrase: 'it works', type: 'problem_solved' },
    { phrase: 'it worked', type: 'problem_solved' },
    { phrase: 'fixed it', type: 'problem_solved' },
    { phrase: 'got it working', type: 'problem_solved' },
    { phrase: 'finally', type: 'breakthrough' },
    { phrase: 'thank you', type: 'gratitude' },
    { phrase: 'thanks so much', type: 'gratitude' },
    { phrase: 'perfect', type: 'satisfaction' },
    { phrase: 'exactly what i needed', type: 'satisfaction' }
  ];
  
  for (const { phrase, type } of celebrationPhrases) {
    if (normalizedText.includes(phrase)) {
      return { celebrate: true, achievementType: type };
    }
  }
  
  return { celebrate: false };
}

// Get emotional intelligence insights for a conversation
export function getConversationEmotionalInsights(channelId: string, hours = 1): {
  overallMood: Sentiment;
  needsAttention: boolean;
  celebrationOpportunities: number;
  frustrationSpikes: number;
} {
  const db = getDB();
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  
  const sentiments = db.prepare(`
    SELECT sentiment, emotional_markers
    FROM sentiment_history
    WHERE channel_id = ? AND created_at > ?
    ORDER BY created_at DESC
  `).all(channelId, since) as { sentiment: Sentiment; emotional_markers: string }[];
  
  if (sentiments.length === 0) {
    return { overallMood: 'neutral', needsAttention: false, celebrationOpportunities: 0, frustrationSpikes: 0 };
  }
  
  const sentimentValues: Record<Sentiment, number> = {
    very_negative: -2,
    negative: -1,
    neutral: 0,
    positive: 1,
    very_positive: 2
  };
  
  const avgValue = sentiments.reduce((sum, s) => sum + sentimentValues[s.sentiment], 0) / sentiments.length;
  
  let overallMood: Sentiment;
  if (avgValue <= -1.5) overallMood = 'very_negative';
  else if (avgValue < -0.5) overallMood = 'negative';
  else if (avgValue < 0.5) overallMood = 'neutral';
  else if (avgValue < 1.5) overallMood = 'positive';
  else overallMood = 'very_positive';
  
  const needsAttention = sentiments.filter(s => s.sentiment === 'very_negative').length > 2;
  const celebrationOpportunities = sentiments.filter(s => s.sentiment === 'very_positive').length;
  const frustrationSpikes = sentiments.filter(s => {
    try {
      const markers = JSON.parse(s.emotional_markers) as string[];
      return markers.some(m => m.startsWith('frustration:'));
    } catch {
      return false;
    }
  }).length;
  
  return { overallMood, needsAttention, celebrationOpportunities, frustrationSpikes };
}
