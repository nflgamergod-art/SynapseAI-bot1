import { getDB } from './db';

/**
 * Preventive Support Assistant & Knowledge Base
 * Features:
 * - Common question detection
 * - Knowledge base building
 * - Auto-suggestion system
 * - Pattern-based prevention
 * - FAQ automation
 */

function nowISO() {
  return new Date().toISOString();
}

// Add entry to knowledge base
export function addKnowledgeEntry(opts: {
  guildId: string | null;
  category: string;
  question: string;
  answer: string;
  tags?: string[];
  sourceMessageId?: string;
  addedBy: string;
}): number {
  const { guildId, category, question, answer, tags, sourceMessageId, addedBy } = opts;
  const db = getDB();
  const now = nowISO();
  
  const result = db.prepare(`
    INSERT INTO knowledge_base
    (guild_id, category, question, answer, tags, source_message_id, times_helpful, added_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
  `).run(guildId, category, question, answer, tags ? JSON.stringify(tags) : null, sourceMessageId || null, addedBy, now, now);
  
  return result.lastInsertRowid as number;
}

// Search knowledge base
export function searchKnowledge(guildId: string | null, query: string, limit = 5): any[] {
  const db = getDB();
  
  // Strip emojis from query for better matching
  const cleanQuery = query.replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '').trim();
  
  const searchTerms = cleanQuery.toLowerCase().split(' ').filter(w => w.length > 3);
  
  if (searchTerms.length === 0) return [];
  
  // Simple keyword matching (can be enhanced with full-text search)
  const results = db.prepare(`
    SELECT *, 
      (CASE 
        WHEN LOWER(question) LIKE ? THEN 10
        WHEN LOWER(answer) LIKE ? THEN 5
        WHEN LOWER(tags) LIKE ? THEN 3
        ELSE 0
      END) as relevance_score
    FROM knowledge_base
    WHERE guild_id = ? AND relevance_score > 0
    ORDER BY relevance_score DESC, times_helpful DESC
    LIMIT ?
  `).all(`%${searchTerms[0]}%`, `%${searchTerms[0]}%`, `%${searchTerms[0]}%`, guildId, limit) as any[];
  
  return results;
}

// Detect if a question is similar to existing knowledge
export function findSimilarQuestions(guildId: string | null, question: string, threshold = 0.6): {
  entry: any;
  similarity: number;
}[] {
  const db = getDB();
  const entries = db.prepare(`
    SELECT * FROM knowledge_base WHERE guild_id = ?
  `).all(guildId) as any[];
  
  const questionWords = question.toLowerCase().split(' ').filter(w => w.length > 3);
  const similarities: { entry: any; similarity: number }[] = [];
  
  for (const entry of entries) {
    const entryWords = entry.question.toLowerCase().split(' ').filter((w: string) => w.length > 3);
    
    // Calculate Jaccard similarity
    const intersection = questionWords.filter(w => entryWords.includes(w)).length;
    const union = new Set([...questionWords, ...entryWords]).size;
    const similarity = union > 0 ? intersection / union : 0;
    
    if (similarity >= threshold) {
      similarities.push({ entry, similarity });
    }
  }
  
  return similarities.sort((a, b) => b.similarity - a.similarity);
}

// Mark knowledge entry as helpful
export function markKnowledgeHelpful(entryId: number) {
  const db = getDB();
  db.prepare(`
    UPDATE knowledge_base
    SET times_helpful = times_helpful + 1, updated_at = ?
    WHERE id = ?
  `).run(nowISO(), entryId);
}

// Get trending/most helpful knowledge
export function getTrendingKnowledge(guildId: string | null, limit = 10, days = 7) {
  const db = getDB();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  
  return db.prepare(`
    SELECT * FROM knowledge_base
    WHERE guild_id = ? AND updated_at > ?
    ORDER BY times_helpful DESC
    LIMIT ?
  `).all(guildId, since, limit) as any[];
}

// Detect common patterns in questions
export function detectCommonPatterns(guildId: string | null, hours = 24): {
  pattern: string;
  occurrences: number;
  suggestedKnowledgeEntry?: string;
}[] {
  const db = getDB();
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  
  // Get recent support interactions
  const interactions = db.prepare(`
    SELECT question FROM support_interactions
    WHERE guild_id = ? AND started_at > ?
  `).all(guildId, since) as { question: string | null }[];
  
  // Extract common phrases (3+ word phrases)
  const phraseCount: Record<string, number> = {};
  
  for (const interaction of interactions) {
    if (!interaction.question) continue;
    
    const words = interaction.question.toLowerCase().split(' ');
    for (let i = 0; i < words.length - 2; i++) {
      const phrase = words.slice(i, i + 3).join(' ');
      phraseCount[phrase] = (phraseCount[phrase] || 0) + 1;
    }
  }
  
  // Find patterns that appear 3+ times
  const patterns = Object.entries(phraseCount)
    .filter(([_, count]) => count >= 3)
    .map(([pattern, occurrences]) => ({
      pattern,
      occurrences,
      suggestedKnowledgeEntry: `Consider adding: "How to ${pattern}"`
    }))
    .sort((a, b) => b.occurrences - a.occurrences);
  
  return patterns;
}

// Auto-suggest response based on question
export function autoSuggestResponse(guildId: string | null, question: string): {
  suggested: boolean;
  response?: string;
  confidence: number;
  sourceEntry?: any;
} {
  const similar = findSimilarQuestions(guildId, question, 0.7);
  
  if (similar.length > 0) {
    const best = similar[0];
    return {
      suggested: true,
      response: best.entry.answer,
      confidence: best.similarity,
      sourceEntry: best.entry
    };
  }
  
  return {
    suggested: false,
    confidence: 0
  };
}

// Get knowledge base stats
export function getKnowledgeStats(guildId: string | null): {
  totalEntries: number;
  totalCategories: number;
  mostHelpfulEntry: any | null;
  recentContributions: number;
  averageHelpfulness: number;
} {
  const db = getDB();
  
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total_entries,
      COUNT(DISTINCT category) as total_categories,
      AVG(times_helpful) as avg_helpfulness
    FROM knowledge_base
    WHERE guild_id = ?
  `).get(guildId) as { total_entries: number; total_categories: number; avg_helpfulness: number };
  
  const mostHelpful = db.prepare(`
    SELECT * FROM knowledge_base
    WHERE guild_id = ?
    ORDER BY times_helpful DESC
    LIMIT 1
  `).get(guildId) as any;
  
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const recentContributions = db.prepare(`
    SELECT COUNT(*) as count FROM knowledge_base
    WHERE guild_id = ? AND created_at > ?
  `).get(guildId, weekAgo) as { count: number };
  
  return {
    totalEntries: stats.total_entries,
    totalCategories: stats.total_categories,
    mostHelpfulEntry: mostHelpful,
    recentContributions: recentContributions.count,
    averageHelpfulness: stats.avg_helpfulness || 0
  };
}

// Build FAQ from knowledge base
export function buildFAQ(guildId: string | null, category?: string, limit = 20): {
  category: string;
  entries: { question: string; answer: string; timesHelpful: number }[];
}[] {
  const db = getDB();
  
  let query = `
    SELECT category, question, answer, times_helpful
    FROM knowledge_base
    WHERE guild_id = ?
  `;
  const params: any[] = [guildId];
  
  if (category) {
    query += ` AND category = ?`;
    params.push(category);
  }
  
  query += ` ORDER BY category, times_helpful DESC LIMIT ?`;
  params.push(limit);
  
  const entries = db.prepare(query).all(...params) as any[];
  
  // Group by category
  const faqByCategory: Record<string, any[]> = {};
  for (const entry of entries) {
    if (!faqByCategory[entry.category]) {
      faqByCategory[entry.category] = [];
    }
    faqByCategory[entry.category].push({
      question: entry.question,
      answer: entry.answer,
      timesHelpful: entry.times_helpful
    });
  }
  
  return Object.entries(faqByCategory).map(([category, entries]) => ({
    category,
    entries
  }));
}

// Suggest knowledge entries that should be created based on unresolved patterns
export function suggestMissingKnowledge(guildId: string | null, days = 7): {
  suggestedQuestion: string;
  occurrences: number;
  reason: string;
}[] {
  const db = getDB();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  
  // Get unresolved or slow-to-resolve interactions
  const slowResolutions = db.prepare(`
    SELECT question, question_category as category,
      (julianday(ended_at) - julianday(started_at)) * 24 * 60 as resolution_minutes
    FROM support_interactions
    WHERE guild_id = ? AND started_at > ? AND was_resolved = 1 AND question IS NOT NULL AND ended_at IS NOT NULL
  `).all(guildId, since) as { question: string; category: string; resolution_minutes: number }[];
  
  // Group similar questions
  const questionGroups: Record<string, { questions: string[]; avgTime: number; category: string }> = {};
  
  for (const item of slowResolutions) {
    // Extract key topic (first 3 words)
    const topic = item.question.split(' ').slice(0, 3).join(' ').toLowerCase();
    
    if (!questionGroups[topic]) {
      questionGroups[topic] = { questions: [], avgTime: 0, category: item.category };
    }
    questionGroups[topic].questions.push(item.question);
    questionGroups[topic].avgTime += item.resolution_minutes;
  }
  
  // Find topics that occur multiple times or take long to resolve
  const suggestions: { suggestedQuestion: string; occurrences: number; reason: string }[] = [];
  
  for (const [topic, data] of Object.entries(questionGroups)) {
    const avgTime = data.avgTime / data.questions.length;
    const occurrences = data.questions.length;
    
    if (occurrences >= 3) {
      suggestions.push({
        suggestedQuestion: data.questions[0], // Use actual question as example
        occurrences,
        reason: `This question was asked ${occurrences} times in the last ${days} days`
      });
    } else if (avgTime > 30) {
      suggestions.push({
        suggestedQuestion: data.questions[0],
        occurrences,
        reason: `This type of question takes an average of ${Math.round(avgTime)} minutes to resolve`
      });
    }
  }
  
  return suggestions.sort((a, b) => b.occurrences - a.occurrences);
}
