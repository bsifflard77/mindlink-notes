import { NextApiRequest, NextApiResponse } from 'next';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { title, channel, transcript, segments } = req.body;

    if (!transcript) {
      return res.status(400).json({ error: 'Transcript is required' });
    }

    console.log('Analyzing video:', title, 'by', channel);

    const prompt = `
      Analyze this YouTube video content and provide comprehensive insights:
      
      Video Title: "${title}"
      Channel: "${channel}"
      
      Full Transcript:
      "${transcript}"
      
      Please provide a JSON response with the following structure:
      {
        "themes": ["theme1", "theme2", "theme3"],
        "key_concepts": ["concept1", "concept2", "concept3"],
        "summary": "Overall video summary in 2-3 sentences",
        "transcript_summary": "Key points from the transcript in bullet format",
        "suggested_actions": ["action1", "action2", "action3"],
        "key_timestamps": [
          {"time": 120, "description": "Important point discussed", "importance": 0.8}
        ],
        "chapters": [
          {"start": 0, "end": 300, "title": "Introduction", "summary": "Chapter summary"}
        ],
        "sentiment": "positive|negative|neutral",
        "complexity_score": 0.5,
        "confidence_score": 0.8
      }
      
      Guidelines:
      - Focus on identifying the most valuable insights and actionable takeaways
      - For key_timestamps, identify 3-5 most important moments with time in seconds
      - For chapters, break content into 2-4 logical sections if the video is long enough
      - Make suggested_actions specific and implementable
      - Keep themes and concepts concise and meaningful
      - Ensure all JSON is properly formatted and valid
    `;

    const message = await anthropic.messages.create({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    
    console.log('Claude response received, parsing...');
    
    try {
      // Try to parse the JSON response
      const analysis = JSON.parse(responseText);
      
      // Validate required fields
      const requiredFields = ['themes', 'key_concepts', 'summary', 'sentiment'];
      const missingFields = requiredFields.filter(field => !analysis[field]);
      
      if (missingFields.length > 0) {
        console.warn('Missing fields in AI response:', missingFields);
        // Fill in missing fields with defaults
        analysis.themes = analysis.themes || [];
        analysis.key_concepts = analysis.key_concepts || [];
        analysis.summary = analysis.summary || 'Summary not available';
        analysis.sentiment = analysis.sentiment || 'neutral';
      }

      // Ensure arrays are actually arrays
      analysis.themes = Array.isArray(analysis.themes) ? analysis.themes : [];
      analysis.key_concepts = Array.isArray(analysis.key_concepts) ? analysis.key_concepts : [];
      analysis.suggested_actions = Array.isArray(analysis.suggested_actions) ? analysis.suggested_actions : [];
      analysis.key_timestamps = Array.isArray(analysis.key_timestamps) ? analysis.key_timestamps : [];
      analysis.chapters = Array.isArray(analysis.chapters) ? analysis.chapters : [];

      console.log('Analysis complete:', {
        themes: analysis.themes.length,
        concepts: analysis.key_concepts.length,
        summary: analysis.summary.length
      });

      res.status(200).json(analysis);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      console.error('Raw response:', responseText);
      
      // Return fallback analysis
      res.status(200).json({
        themes: extractBasicThemes(transcript),
        key_concepts: extractBasicKeywords(transcript),
        summary: generateBasicSummary(transcript),
        transcript_summary: generateBasicSummary(transcript),
        suggested_actions: ['Review key points', 'Take notes on important concepts'],
        key_timestamps: [],
        chapters: [],
        sentiment: 'neutral',
        complexity_score: 0.5,
        confidence_score: 0.3
      });
    }
  } catch (error) {
    console.error('Video analysis failed:', error);
    res.status(500).json({ 
      error: 'Failed to analyze video',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// Fallback functions for when AI fails
function extractBasicThemes(transcript: string): string[] {
  const words = transcript.toLowerCase().split(/\s+/);
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
  
  const wordFreq: Record<string, number> = {};
  
  words.forEach(word => {
    const cleaned = word.replace(/[^\w]/g, '');
    if (cleaned.length > 4 && !stopWords.has(cleaned)) {
      wordFreq[cleaned] = (wordFreq[cleaned] || 0) + 1;
    }
  });
  
  return Object.entries(wordFreq)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([word]) => word);
}

function extractBasicKeywords(transcript: string): string[] {
  // Look for capitalized words that might be proper nouns or important concepts
  const words = transcript.split(/\s+/);
  const keywords = words
    .filter(word => /^[A-Z][a-z]+/.test(word) && word.length > 3)
    .slice(0, 8);
  
  return [...new Set(keywords)]; // Remove duplicates
}

function generateBasicSummary(transcript: string): string {
  const sentences = transcript.split(/[.!?]+/).filter(s => s.trim().length > 20);
  
  if (sentences.length <= 3) {
    return transcript.substring(0, 300) + '...';
  }
  
  // Return first and last sentences
  return sentences[0].trim() + '. ' + sentences[sentences.length - 1].trim() + '.';
}