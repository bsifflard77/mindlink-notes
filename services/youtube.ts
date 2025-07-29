import { AppError, YouTubeAnalysis, TranscriptSegment } from '../types';

export class YouTubeService {
  private static readonly YOUTUBE_URL_REGEX = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/;
  
  /**
   * Extract YouTube video ID from URL
   */
  static extractVideoId(url: string): string | null {
    const match = url.match(this.YOUTUBE_URL_REGEX);
    return match ? match[1] : null;
  }

  /**
   * Get video metadata using YouTube oEmbed API
   */
  static async getVideoMetadata(videoId: string): Promise<{
    title: string;
    channel: string;
    duration: number;
    published_date: string;
    thumbnail_url: string;
    description?: string;
  }> {
    try {
      const response = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
      
      if (!response.ok) {
        throw new AppError('Failed to fetch video metadata', 'YOUTUBE_FETCH_FAILED');
      }
      
      const data = await response.json();
      
      return {
        title: data.title || 'Unknown Title',
        channel: data.author_name || 'Unknown Channel',
        duration: 0, // Would need YouTube API for accurate duration
        published_date: new Date().toISOString(),
        thumbnail_url: data.thumbnail_url || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        description: data.description
      };
    } catch (error) {
      console.error('Error fetching video metadata:', error);
      throw new AppError('Failed to fetch video metadata', 'YOUTUBE_FETCH_FAILED', error);
    }
  }

  /**
   * Get video transcript using youtube-transcript package
   */
  static async getTranscript(videoId: string): Promise<TranscriptSegment[]> {
    try {
      // Call our API route to get transcript
      const response = await fetch('/api/youtube/transcript', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ videoId }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch transcript');
      }

      const data = await response.json();
      return data.transcript;
    } catch (error) {
      console.error('Error fetching transcript:', error);
      throw new AppError(
        'Failed to fetch video transcript. Video may not have captions available.',
        'TRANSCRIPT_FAILED',
        error
      );
    }
  }

  /**
   * Convert transcript segments to full text
   */
  static transcriptToText(segments: TranscriptSegment[]): string {
    return segments.map(segment => segment.text).join(' ');
  }

  /**
   * Process YouTube video: fetch metadata, transcript, and analyze
   */
  static async processVideo(
    url: string,
    onProgress?: (stage: string, percentage: number, message: string) => void
  ): Promise<{
    metadata: Awaited<ReturnType<typeof YouTubeService.getVideoMetadata>>;
    transcript: TranscriptSegment[];
    fullTranscript: string;
    analysis: YouTubeAnalysis;
  }> {
    const videoId = this.extractVideoId(url);
    
    if (!videoId) {
      throw new AppError('Invalid YouTube URL', 'VALIDATION_ERROR');
    }

    onProgress?.('fetching', 10, 'Fetching video information...');

    // Get metadata
    const metadata = await this.getVideoMetadata(videoId);
    
    onProgress?.('transcribing', 30, 'Getting video transcript...');

    // Get transcript
    const transcript = await this.getTranscript(videoId);
    const fullTranscript = this.transcriptToText(transcript);

    onProgress?.('analyzing', 60, 'Analyzing content with AI...');

    // Analyze with AI
    const analysis = await this.analyzeVideoContent(metadata, fullTranscript, transcript);

    onProgress?.('complete', 100, 'Video processing complete!');

    return {
      metadata,
      transcript,
      fullTranscript,
      analysis
    };
  }

  /**
   * Analyze video content using AI
   */
  private static async analyzeVideoContent(
    metadata: Awaited<ReturnType<typeof YouTubeService.getVideoMetadata>>,
    fullTranscript: string,
    transcript: TranscriptSegment[]
  ): Promise<YouTubeAnalysis> {
    try {
      // Call our AI analysis API endpoint
      const response = await fetch('/api/ai/analyze-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: metadata.title,
          channel: metadata.channel,
          transcript: fullTranscript,
          segments: transcript
        }),
      });

      if (!response.ok) {
        throw new Error('AI analysis failed');
      }

      const analysis = await response.json();
      
      return {
        themes: analysis.themes || [],
        key_concepts: analysis.key_concepts || [],
        summary: analysis.summary,
        transcript_summary: analysis.transcript_summary,
        suggested_actions: analysis.suggested_actions || [],
        key_timestamps: analysis.key_timestamps || [],
        chapters: analysis.chapters || [],
        complexity_score: analysis.complexity_score || 0.5,
        confidence_score: analysis.confidence_score || 0.8,
        sentiment: analysis.sentiment || 'neutral'
      };
    } catch (error) {
      console.error('Error analyzing video:', error);
      // Return basic analysis if AI fails
      return {
        themes: this.extractBasicThemes(fullTranscript),
        summary: this.generateBasicSummary(fullTranscript),
        transcript_summary: this.generateBasicSummary(fullTranscript),
        confidence_score: 0.3,
        sentiment: 'neutral'
      };
    }
  }

  /**
   * Extract basic themes using simple keyword analysis (fallback)
   */
  private static extractBasicThemes(transcript: string): string[] {
    const words = transcript.toLowerCase().split(/\s+/);
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
    
    const wordFreq: Record<string, number> = {};
    
    words.forEach(word => {
      const cleaned = word.replace(/[^\w]/g, '');
      if (cleaned.length > 3 && !stopWords.has(cleaned)) {
        wordFreq[cleaned] = (wordFreq[cleaned] || 0) + 1;
      }
    });
    
    return Object.entries(wordFreq)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([word]) => word);
  }

  /**
   * Generate basic summary (fallback)
   */
  private static generateBasicSummary(transcript: string): string {
    const sentences = transcript.split(/[.!?]+/).filter(s => s.trim().length > 20);
    
    if (sentences.length <= 3) {
      return transcript.substring(0, 300) + '...';
    }
    
    // Return first and last sentences
    return sentences[0].trim() + '. ' + sentences[sentences.length - 1].trim() + '.';
  }

  /**
   * Format timestamp for display
   */
  static formatTimestamp(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Generate YouTube timestamp URL
   */
  static generateTimestampUrl(videoId: string, timestamp: number): string {
    return `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(timestamp)}s`;
  }
}