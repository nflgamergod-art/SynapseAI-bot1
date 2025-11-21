import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";

/**
 * Homework Helper Service
 * Analyzes images of homework assignments and provides detailed answers
 * Supports multimodal AI (Gemini Vision and GPT-4 Vision)
 */

interface HomeworkResult {
  answer: string;
  explanation?: string;
  steps?: string[];
  subject?: string;
  confidence: number;
}

/**
 * Analyze homework image using AI vision models
 */
export async function analyzeHomework(imageUrl: string, userQuestion?: string): Promise<HomeworkResult> {
  const provider = (process.env.AI_PROVIDER || '').toLowerCase();
  
  // Try OpenAI first if configured
  if (provider === 'openai' || (!provider && process.env.OPENAI_API_KEY)) {
    try {
      return await analyzeWithOpenAI(imageUrl, userQuestion);
    } catch (error) {
      console.error('OpenAI homework analysis failed, trying Gemini:', error);
      // Fall through to Gemini if OpenAI fails
    }
  }
  
  // Try Gemini if OpenAI not available or failed
  if (provider === 'gemini' || process.env.GEMINI_API_KEY) {
    return analyzeWithGemini(imageUrl, userQuestion);
  }
  
  throw new Error('No AI provider configured for homework help. Please set OPENAI_API_KEY or GEMINI_API_KEY');
}

async function analyzeWithGemini(imageUrl: string, userQuestion?: string): Promise<HomeworkResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Gemini API key not configured');
  
  const genAI = new GoogleGenerativeAI(key);
  
  // Use Gemini 1.5 Pro for best multimodal capabilities
  const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-pro",
    generationConfig: {
      temperature: 0.4, // Lower temperature for more accurate educational responses
      topP: 0.95,
      maxOutputTokens: 2048,
    }
  });
  
  try {
    // Fetch the image
    const response = await fetch(imageUrl);
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    
    const prompt = `You are an expert tutor helping a student with their homework. Analyze this image carefully and provide a comprehensive answer.

${userQuestion ? `Student's question: ${userQuestion}\n\n` : ''}

Instructions:
1. Identify the subject (Math, Science, English, History, etc.)
2. Read and understand the question(s) in the image
3. Provide clear, step-by-step explanations
4. Show your work and reasoning
5. Give the final answer(s)
6. If it's a math problem, show each calculation step
7. If it's a reading/writing assignment, provide thoughtful analysis
8. Be encouraging and educational in your tone

Format your response clearly with:
- **Subject:** [subject name]
- **Problem:** [restate the question]
- **Solution:** [step-by-step explanation]
- **Answer:** [final answer]

Be thorough but concise. Help the student understand, don't just give answers.`;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: response.headers.get('content-type') || 'image/jpeg',
          data: base64
        }
      }
    ]);
    
    const text = result.response.text();
    
    // Parse the response to extract structured information
    const subjectMatch = text.match(/\*\*Subject:\*\*\s*(.+?)(?:\n|$)/i);
    const subject = subjectMatch ? subjectMatch[1].trim() : undefined;
    
    return {
      answer: text,
      subject,
      confidence: 0.85
    };
  } catch (error: any) {
    console.error('Gemini homework analysis failed:', error);
    throw new Error(`Failed to analyze homework: ${error.message}`);
  }
}

async function analyzeWithOpenAI(imageUrl: string, userQuestion?: string): Promise<HomeworkResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OpenAI API key not configured');
  
  const openai = new OpenAI({ apiKey: key });
  
  try {
    const prompt = `You are an expert tutor helping a student with their homework. Analyze this image carefully and provide a comprehensive answer.

${userQuestion ? `Student's question: ${userQuestion}\n\n` : ''}

Instructions:
1. Identify the subject (Math, Science, English, History, etc.)
2. Read and understand the question(s) in the image
3. Provide clear, step-by-step explanations
4. Show your work and reasoning
5. Give the final answer(s)
6. If it's a math problem, show each calculation step
7. If it's a reading/writing assignment, provide thoughtful analysis
8. Be encouraging and educational in your tone

Format your response clearly with:
- **Subject:** [subject name]
- **Problem:** [restate the question]
- **Solution:** [step-by-step explanation]
- **Answer:** [final answer]

Be thorough but concise. Help the student understand, don't just give answers.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } }
          ]
        }
      ],
      max_tokens: 2048,
      temperature: 0.4
    });
    
    const text = response.choices[0]?.message?.content || 'Unable to analyze homework.';
    
    // Parse the response to extract structured information
    const subjectMatch = text.match(/\*\*Subject:\*\*\s*(.+?)(?:\n|$)/i);
    const subject = subjectMatch ? subjectMatch[1].trim() : undefined;
    
    return {
      answer: text,
      subject,
      confidence: 0.85
    };
  } catch (error: any) {
    console.error('OpenAI homework analysis failed:', error);
    throw new Error(`Failed to analyze homework: ${error.message}`);
  }
}

/**
 * Check if a message appears to be homework-related
 */
export function isHomeworkRelated(content: string): boolean {
  const homeworkKeywords = [
    'homework', 'assignment', 'problem', 'question', 'help me solve',
    'can you help', 'math', 'science', 'english', 'history',
    'equation', 'calculate', 'solve', 'answer', 'what is',
    'how do i', 'explain', 'study', 'test', 'quiz', 'exam'
  ];
  
  const lowerContent = content.toLowerCase();
  return homeworkKeywords.some(keyword => lowerContent.includes(keyword));
}
