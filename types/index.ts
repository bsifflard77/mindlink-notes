// Core database types
export interface Note {
  id: string;
  user_id: string;
  title?: string;
  content: string;
  note_type: 'text' | 'voice' | 'youtube' | 'synthesis' | 'strategy';
  source_url?: string;
  metadata: Record<string, any>;
  tags: string[];
  ai_analysis: AIAnalysis;
  embedding?: number[];
  created_at: string;
  updated_at: string;
}

export interface YoutubeVideo {
  id: string;
  note_id: string;
  youtube_id: string;
  title: string;
  channel_name?: string;
  duration?: number;
  transcript?: string;
  transcript_processed_at?: string;
  thumbnail_url?: string;
  published_at?: string;
  created_at: string;
}

// AI Analysis types
export interface AIAnalysis {
  themes?: string[];
  sentiment?: 'positive' | 'negative' | 'neutral';
  key_concepts?: string[];
  suggested_actions?: string[];
  related_topics?: string[];
  complexity_score?: number;
  summary?: string;
  confidence_score?: number;
}

export interface YouTubeAnalysis extends AIAnalysis {
  transcript_summary?: string;
  key_timestamps?: Array<{
    time: number;
    description: string;
    importance: number;
  }>;
  chapters?: Array<{
    start: number;
    end: number;
    title: string;
    summary: string;
  }>;
}

// UI and form types
export interface NoteInput {
  content: string;
  title?: string;
  tags?: string[];
  note_type?: Note['note_type'];
  source_url?: string;
}

// API response types
export interface APIResponse<T = any> {
  data?: T;
  error?: string;
  success: boolean;
}

// Hook return types
export interface UseNotesReturn {
  notes: Note[];
  loading: boolean;
  error: string | null;
  createNote: (input: NoteInput) => Promise<Note>;
  updateNote: (id: string, updates: Partial<Note>) => Promise<Note>;
  deleteNote: (id: string) => Promise<void>;
  refetch: () => void;
}

// Error types
export class AppError extends Error {
  code: string;
  details?: any;
  
  constructor(message: string, code: string, details?: any) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }
}

// Transcript segment for YouTube videos
export interface TranscriptSegment {
  text: string;
  start: number;  // timestamp in seconds
  duration: number; // duration in seconds
}