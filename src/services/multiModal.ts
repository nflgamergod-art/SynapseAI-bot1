import { getDB } from './db';

/**
 * Multi-Modal Input Understanding
 * Features:
 * - Screenshot OCR and text extraction
 * - Error code detection
 * - Code snippet extraction from images
 * - Visual content analysis
 * 
 * Note: Requires external OCR service integration (Tesseract.js or Cloud Vision API)
 */

function nowISO() {
  return new Date().toISOString();
}

// Placeholder for OCR - integrate with tesseract.js or Cloud Vision API
async function performOCR(imageUrl: string): Promise<string> {
  // TODO: Integrate with actual OCR service
  // For now, return placeholder
  // Real implementation would use:
  // - tesseract.js for client-side OCR
  // - Google Cloud Vision API
  // - AWS Textract
  return '';
}

// Detect error patterns in extracted text
export function detectErrors(text: string): { errorType: string; errorCode?: string; description: string }[] {
  const errors: { errorType: string; errorCode?: string; description: string }[] = [];
  
  // Common error patterns
  const patterns = [
    { regex: /error\s+code:\s*0x([0-9a-f]+)/i, type: 'Windows Error', extract: (m: RegExpMatchArray) => ({ errorCode: `0x${m[1]}`, description: `Windows error code 0x${m[1]}` }) },
    { regex: /exception\s+(\w+Exception)/i, type: 'Exception', extract: (m: RegExpMatchArray) => ({ description: m[1] }) },
    { regex: /(\w+Error):\s*(.+)/i, type: 'JavaScript Error', extract: (m: RegExpMatchArray) => ({ errorCode: m[1], description: m[2] }) },
    { regex: /HTTP\s+(\d{3})/i, type: 'HTTP Error', extract: (m: RegExpMatchArray) => ({ errorCode: m[1], description: `HTTP ${m[1]} error` }) },
    { regex: /line\s+(\d+)/i, type: 'Syntax Error', extract: (m: RegExpMatchArray) => ({ description: `Error at line ${m[1]}` }) },
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern.regex);
    if (match) {
      const extracted = pattern.extract(match);
      errors.push({
        errorType: pattern.type,
        ...extracted
      });
    }
  }
  
  return errors;
}

// Extract code from text
export function extractCode(text: string): { language?: string; code: string }[] {
  const codeBlocks: { language?: string; code: string }[] = [];
  
  // Detect code block markers
  const fencedRegex = /```(\w+)?\n([\s\S]+?)```/g;
  let match;
  
  while ((match = fencedRegex.exec(text)) !== null) {
    codeBlocks.push({
      language: match[1],
      code: match[2].trim()
    });
  }
  
  // Also detect indented code (4 spaces or tab)
  const lines = text.split('\n');
  let currentBlock: string[] = [];
  
  for (const line of lines) {
    if (line.startsWith('    ') || line.startsWith('\t')) {
      currentBlock.push(line.trim());
    } else if (currentBlock.length > 0) {
      codeBlocks.push({ code: currentBlock.join('\n') });
      currentBlock = [];
    }
  }
  
  if (currentBlock.length > 0) {
    codeBlocks.push({ code: currentBlock.join('\n') });
  }
  
  return codeBlocks;
}

// Analyze image and store results
export async function analyzeImage(opts: {
  messageId: string;
  channelId: string;
  guildId: string | null;
  userId: string;
  imageUrl: string;
}): Promise<{ extractedText: string; errors: any[]; codeBlocks: any[]; suggestedResponse?: string }> {
  const { messageId, channelId, guildId, userId, imageUrl } = opts;
  const db = getDB();
  const now = nowISO();
  
  // Perform OCR (placeholder - needs real integration)
  const extractedText = await performOCR(imageUrl);
  
  // Detect what type of content this is
  let analysisType = 'screenshot';
  if (extractedText.includes('error') || extractedText.includes('exception')) {
    analysisType = 'error';
  } else if (extractedText.match(/function|class|const|let|var|import/)) {
    analysisType = 'code';
  }
  
  // Extract useful information
  const errors = detectErrors(extractedText);
  const codeBlocks = extractCode(extractedText);
  
  // Build suggested response
  let suggestedResponse = '';
  if (errors.length > 0) {
    const primaryError = errors[0];
    suggestedResponse = `I detected a ${primaryError.errorType}${primaryError.errorCode ? ` (${primaryError.errorCode})` : ''}. ${primaryError.description}`;
  } else if (codeBlocks.length > 0) {
    suggestedResponse = `I extracted ${codeBlocks.length} code snippet(s) from your image.`;
  }
  
  // Store analysis
  const detectedEntities = JSON.stringify([...errors.map(e => e.errorCode).filter(Boolean), ...codeBlocks.map((_, i) => `code_block_${i}`)]);
  
  db.prepare(`
    INSERT OR REPLACE INTO image_analysis
    (message_id, channel_id, guild_id, user_id, image_url, analysis_type, extracted_text, detected_entities, suggested_response, confidence, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(messageId, channelId, guildId, userId, imageUrl, analysisType, extractedText, detectedEntities, suggestedResponse, 0.7, now);
  
  return {
    extractedText,
    errors,
    codeBlocks,
    suggestedResponse
  };
}

// Get previous image analyses for context
export function getPreviousImageAnalyses(channelId: string, limit = 5) {
  const db = getDB();
  return db.prepare(`
    SELECT * FROM image_analysis
    WHERE channel_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(channelId, limit) as any[];
}
