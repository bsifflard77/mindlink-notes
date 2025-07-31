import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { videoId } = req.body;

    if (!videoId) {
      return res.status(400).json({ error: 'Video ID is required' });
    }

    console.log('Fetching transcript for video:', videoId);

    // Use YouTube's API directly with fetch (more reliable in serverless)
    const transcript = await fetchYouTubeTranscript(videoId);
    
    console.log(`Successfully fetched ${transcript.length} transcript segments`);

    res.status(200).json({
      success: true,
      transcript: transcript
    });

  } catch (error) {
    console.error('Transcript fetch error:', error);
    
    // Handle different error types
    if (error.message?.includes('No transcript available')) {
      return res.status(404).json({ 
        error: 'No transcript available for this video. The video may not have captions enabled.',
        code: 'NO_TRANSCRIPT'
      });
    }

    if (error.message?.includes('Video unavailable')) {
      return res.status(404).json({ 
        error: 'Video not found or is private/unavailable.',
        code: 'VIDEO_UNAVAILABLE'
      });
    }

    res.status(500).json({ 
      error: 'Failed to fetch transcript',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Transcript service unavailable'
    });
  }
}

// Serverless-friendly transcript fetching using YouTube's web API
async function fetchYouTubeTranscript(videoId: string) {
  try {
    // Method 1: Try to get transcript via YouTube's internal API
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error('Video unavailable');
    }

    const html = await response.text();
    
    // Extract caption track URL from page HTML
    const captionRegex = /"captionTracks":\s*(\[.*?\])/;
    const match = html.match(captionRegex);
    
    if (!match) {
      throw new Error('No transcript available');
    }

    const captionTracks = JSON.parse(match[1]);
    
    if (captionTracks.length === 0) {
      throw new Error('No transcript available');
    }

    // Get the first available caption track (usually auto-generated or English)
    const captionTrack = captionTracks.find(track => 
      track.languageCode === 'en' || track.languageCode === 'en-US'
    ) || captionTracks[0];

    if (!captionTrack.baseUrl) {
      throw new Error('No transcript available');
    }

    // Fetch the actual transcript XML
    const transcriptResponse = await fetch(captionTrack.baseUrl);
    
    if (!transcriptResponse.ok) {
      throw new Error('Failed to fetch transcript data');
    }

    const transcriptXML = await transcriptResponse.text();
    
    // Parse XML and extract transcript segments
    const segments = parseTranscriptXML(transcriptXML);
    
    return segments;
    
  } catch (error) {
    console.error('YouTube transcript error:', error);
    // Fallback: return empty transcript for now
    return [];
  }
}

// Parse YouTube transcript XML format
function parseTranscriptXML(xml: string) {
  const segments = [];
  
  // Simple regex to extract transcript entries
  const textRegex = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;
  let match;
  
  while ((match = textRegex.exec(xml)) !== null) {
    const start = parseFloat(match[1]);
    const duration = parseFloat(match[2]);
    const text = decodeHTMLEntities(match[3].trim());
    
    if (text && text.length > 0) {
      segments.push({
        start: start,
        duration: duration,
        text: text
      });
    }
  }
  
  return segments;
}

// Decode HTML entities in transcript text
function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n/g, ' ')
    .trim();
}