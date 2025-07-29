import { NextApiRequest, NextApiResponse } from 'next';
import { YoutubeTranscript } from 'youtube-transcript';

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

    // Fetch transcript using youtube-transcript
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);
    
    // Convert to our format
    const formattedTranscript = transcript.map(segment => ({
      start: segment.offset / 1000, // Convert to seconds
      duration: segment.duration / 1000,
      text: segment.text
    }));

    console.log(`Successfully fetched ${formattedTranscript.length} transcript segments`);

    res.status(200).json({
      success: true,
      transcript: formattedTranscript
    });

  } catch (error) {
    console.error('Transcript fetch error:', error);
    
    // Handle different error types
    if (error.message?.includes('Could not retrieve transcript')) {
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
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}