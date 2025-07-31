import React, { useState, useRef, useEffect } from 'react';
import { useUser, useSupabaseClient } from '@supabase/auth-helpers-react';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { Plus, Brain, Menu, Mic, MicOff, X, Video, Type, Link as LinkIcon, Loader2, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { YouTubeService } from '../services/youtube';

type CaptureMode = 'text' | 'voice' | 'youtube';

export default function Home() {
  const user = useUser();
  const supabase = useSupabaseClient();
  const [notes, setNotes] = useState<any[]>([]);
  const [showCapture, setShowCapture] = useState(false);
  const [captureMode, setCaptureMode] = useState<CaptureMode>('text');
  const [noteContent, setNoteContent] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{
    stage: string;
    percentage: number;
    message: string;
  } | null>(null);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Check if speech recognition is supported
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      setSpeechSupported(!!SpeechRecognition);
      
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = 'en-US';

        recognitionRef.current.onresult = (event: any) => {
          let finalTranscript = '';
          let interimTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript;
            } else {
              interimTranscript += transcript;
            }
          }

          if (captureMode === 'text') {
            setNoteContent(prev => {
              const withoutInterim = prev.replace(/\[Speaking...\].*$/, '').trim();
              const newContent = withoutInterim + (withoutInterim ? ' ' : '') + finalTranscript;
              
              if (interimTranscript) {
                return newContent + (newContent ? ' ' : '') + `[Speaking...] ${interimTranscript}`;
              }
              
              return newContent;
            });
          }
        };

        recognitionRef.current.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
          if (event.error === 'not-allowed') {
            alert('Microphone permission denied. Please allow microphone access and try again.');
          }
        };

        recognitionRef.current.onend = () => {
          setIsListening(false);
          if (captureMode === 'text') {
            setNoteContent(prev => prev.replace(/\[Speaking...\].*$/, '').trim());
          }
        };
      }
    }
  }, [captureMode]);

  // Start voice recognition
  const startListening = () => {
    if (recognitionRef.current && speechSupported) {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (error) {
        console.error('Error starting speech recognition:', error);
      }
    }
  };

  // Stop voice recognition
  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  // Create text note
  const createTextNote = async () => {
    if (!noteContent.trim() || !user) return;

    try {
      const cleanContent = noteContent.replace(/\[Speaking...\].*$/, '').trim();
      
      const { data, error } = await supabase
        .from('notes')
        .insert({
          user_id: user.id,
          content: cleanContent,
          note_type: 'text',
          tags: [],
          ai_analysis: {},
          metadata: { created_via: isListening ? 'voice' : 'text' }
        })
        .select()
        .single();

      if (error) throw error;

      setNotes([data, ...notes]);
      setNoteContent('');
      setShowCapture(false);
      stopListening();
    } catch (error) {
      console.error('Error creating note:', error);
      alert('Failed to create note');
    }
  };

  // Create YouTube note
  const createYouTubeNote = async () => {
    if (!youtubeUrl.trim() || !user) return;
    
    const videoId = YouTubeService.extractVideoId(youtubeUrl);
    if (!videoId) {
      alert('Please enter a valid YouTube URL');
      return;
    }

    setIsProcessing(true);
    setProgress({
      stage: 'starting',
      percentage: 0,
      message: 'Processing YouTube video...'
    });

    try {
      const result = await YouTubeService.processVideo(
        youtubeUrl,
        (stage, percentage, message) => {
          setProgress({ stage, percentage, message });
        }
      );

      // Create comprehensive note with YouTube content
      const noteContent = `# ${result.metadata.title}

**Channel:** ${result.metadata.channel}
**Source:** [${youtubeUrl}](${youtubeUrl})

## 📝 Summary
${result.analysis.summary}

## 🎯 Key Insights
${result.analysis.key_concepts?.map(concept => `• ${concept}`).join('\n') || 'No key concepts identified'}

## 🏷️ Main Themes
${result.analysis.themes?.map(theme => `• ${theme}`).join('\n') || 'No themes identified'}

## ⚡ Suggested Actions
${result.analysis.suggested_actions?.map(action => `• ${action}`).join('\n') || 'No actions suggested'}

${result.analysis.key_timestamps?.length ? `## ⏰ Key Timestamps
${result.analysis.key_timestamps.map(ts => `• [${YouTubeService.formatTimestamp(ts.time)}](${YouTubeService.generateTimestampUrl(videoId, ts.time)}) - ${ts.description}`).join('\n')}` : ''}

${result.analysis.chapters?.length ? `## 📖 Chapters
${result.analysis.chapters.map(ch => `### ${ch.title} (${YouTubeService.formatTimestamp(ch.start)} - ${YouTubeService.formatTimestamp(ch.end)})
${ch.summary}`).join('\n\n')}` : ''}

## 📋 Full Transcript
${result.fullTranscript}`;

      const { data, error } = await supabase
        .from('notes')
        .insert({
          user_id: user.id,
          title: result.metadata.title,
          content: noteContent,
          note_type: 'youtube',
          source_url: youtubeUrl,
          tags: result.analysis.themes || [],
          ai_analysis: result.analysis,
          metadata: {
            youtube_id: videoId,
            channel: result.metadata.channel,
            thumbnail: result.metadata.thumbnail_url,
            processed_at: new Date().toISOString()
          }
        })
        .select()
        .single();

      if (error) throw error;

      // Also save YouTube video metadata
      await supabase
        .from('youtube_videos')
        .insert({
          note_id: data.id,
          youtube_id: videoId,
          title: result.metadata.title,
          channel_name: result.metadata.channel,
          transcript: result.fullTranscript,
          thumbnail_url: result.metadata.thumbnail_url,
          transcript_processed_at: new Date().toISOString()
        });

      setNotes([data, ...notes]);
      setYoutubeUrl('');
      setShowCapture(false);
      setProgress(null);
    } catch (error) {
      console.error('Error processing YouTube video:', error);
      alert(`Failed to process YouTube video: ${error.message}`);
      setProgress({
        stage: 'error',
        percentage: 0,
        message: 'Failed to process video. Please try again.'
      });
    } finally {
      setIsProcessing(false);
      setTimeout(() => setProgress(null), 3000);
    }
  };

  // Handle note creation based on mode
  const handleCreateNote = () => {
    if (captureMode === 'youtube') {
      createYouTubeNote();
    } else {
      createTextNote();
    }
  };

  // Load notes
  useEffect(() => {
    if (!user) return;

    const loadNotes = async () => {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .order('created_at', { ascending: false });

      if (data) setNotes(data);
    };

    loadNotes();
  }, [user, supabase]);

  // Close capture modal
  const closeCapture = () => {
    setShowCapture(false);
    setNoteContent('');
    setYoutubeUrl('');
    setCaptureMode('text');
    setIsProcessing(false);
    setProgress(null);
    stopListening();
  };

  // Get note icon based on type
  const getNoteIcon = (noteType: string) => {
    switch (noteType) {
      case 'youtube':
        return <Video size={16} className="text-red-500" />;
      case 'text':
        return <Type size={16} className="text-gray-500" />;
      default:
        return <Type size={16} className="text-gray-500" />;
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Brain className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              MindLink Notes
            </h1>
            <p className="text-gray-600">
              Capture ideas, analyze videos, and build knowledge with AI
            </p>
          </div>
          
          <div className="bg-white rounded-2xl shadow-xl p-6">
            <Auth
              supabaseClient={supabase}
              appearance={{
                theme: ThemeSupa,
                variables: {
                  default: {
                    colors: {
                      brand: '#2563eb',
                      brandAccent: '#3b82f6',
                    },
                  },
                },
              }}
              providers={['google']}
              redirectTo="http://localhost:3000/"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center space-x-3">
          <button className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
            <Menu size={20} />
          </button>
          <h1 className="text-lg font-semibold text-gray-900">MindLink</h1>
        </div>

        <div className="flex items-center space-x-2">
          {/* Voice dictation button */}
          {speechSupported && (
            <motion.button
              onClick={isListening ? stopListening : startListening}
              className={`p-2 rounded-lg shadow-lg transition-colors ${
                isListening 
                  ? 'bg-red-600 text-white hover:bg-red-700' 
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
              whileTap={{ scale: 0.95 }}
              animate={isListening ? { scale: [1, 1.1, 1] } : {}}
              transition={{ repeat: isListening ? Infinity : 0, duration: 1 }}
            >
              {isListening ? <MicOff size={20} /> : <Mic size={20} />}
            </motion.button>
          )}

          {/* Add note button */}
          <motion.button
            onClick={() => setShowCapture(true)}
            className="p-2 bg-blue-600 text-white rounded-lg shadow-lg hover:bg-blue-700 transition-colors"
            whileTap={{ scale: 0.95 }}
          >
            <Plus size={20} />
          </motion.button>
        </div>
      </header>

      {/* Voice feedback banner */}
      <AnimatePresence>
        {isListening && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="bg-red-500 text-white px-4 py-2 text-center text-sm"
          >
            🎤 Listening... Speak clearly and tap the microphone when done
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 p-4">
        {notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <Brain className="w-12 h-12 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Start capturing ideas
            </h3>
            <p className="text-gray-500 mb-6">
              Create notes, analyze YouTube videos, or use voice dictation
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              <button
                onClick={() => { setShowCapture(true); setCaptureMode('text'); }}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg"
              >
                <Type size={18} />
                <span>Text Note</span>
              </button>
              <button
                onClick={() => { setShowCapture(true); setCaptureMode('youtube'); }}
                className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg"
              >
                <Video size={18} />
                <span>YouTube Video</span>
              </button>
              {speechSupported && (
                <button
                  onClick={startListening}
                  className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg"
                >
                  <Mic size={18} />
                  <span>Voice Note</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {notes.map((note) => (
              <motion.div
                key={note.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-xl p-4 shadow-sm border border-gray-200"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    {getNoteIcon(note.note_type)}
                    <span className="text-xs text-gray-500 uppercase tracking-wide">
                      {note.note_type === 'youtube' ? '🎥 YouTube' : 
                       note.metadata?.created_via === 'voice' ? '🎤 Voice' : '📝 Text'}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(note.created_at).toLocaleString()}
                  </span>
                </div>
                
                {note.title && (
                  <h3 className="font-medium text-gray-900 mb-2 line-clamp-2">
                    {note.title}
                  </h3>
                )}
                
                <p className="text-gray-700 text-sm line-clamp-3">
                  {note.content.replace(/[#*`]/g, '').trim().substring(0, 200)}...
                </p>
                
                {note.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {note.tags.slice(0, 3).map((tag: string) => (
                      <span
                        key={tag}
                        className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full"
                      >
                        {tag}
                      </span>
                    ))}
                    {note.tags.length > 3 && (
                      <span className="px-2 py-1 bg-gray-100 text-gray-500 text-xs rounded-full">
                        +{note.tags.length - 3}
                      </span>
                    )}
                  </div>
                )}

                {note.source_url && (
                  <div className="mt-2 flex items-center space-x-1 text-xs text-gray-500">
                    <LinkIcon size={12} />
                    <span>Source available</span>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </main>

      {/* Enhanced Capture Modal */}
      <AnimatePresence>
        {showCapture && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-50"
              onClick={closeCapture}
            />
            <motion.div
              initial={{ opacity: 0, y: '100%' }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Quick Capture</h2>
                <button
                  onClick={closeCapture}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-full"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Mode Selector */}
              <div className="flex p-4 space-x-2 border-b border-gray-100">
                <button
                  onClick={() => setCaptureMode('text')}
                  className={`flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-xl transition-colors ${
                    captureMode === 'text'
                      ? 'bg-blue-100 text-blue-700 border-2 border-blue-300'
                      : 'bg-gray-100 text-gray-600 border-2 border-transparent'
                  }`}
                >
                  <Type size={18} />
                  <span className="font-medium">Text</span>
                </button>
                
                <button
                  onClick={() => setCaptureMode('youtube')}
                  className={`flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-xl transition-colors ${
                    captureMode === 'youtube'
                      ? 'bg-red-100 text-red-700 border-2 border-red-300'
                      : 'bg-gray-100 text-gray-600 border-2 border-transparent'
                  }`}
                >
                  <Video size={18} />
                  <span className="font-medium">YouTube</span>
                </button>
              </div>

              {/* Content Area */}
              <div className="flex-1 p-4 overflow-y-auto">
                {captureMode === 'text' && (
                  <div className="space-y-4">
                    <textarea
                      value={noteContent}
                      onChange={(e) => setNoteContent(e.target.value)}
                      placeholder="What's on your mind? Type your thoughts or use voice dictation..."
                      className="w-full h-32 p-4 text-base border-2 border-gray-200 rounded-xl resize-none focus:border-blue-400 focus:outline-none transition-colors"
                      disabled={isProcessing}
                    />
                    
                    {speechSupported && (
                      <div className="flex items-center justify-center">
                        <motion.button
                          onClick={isListening ? stopListening : startListening}
                          className={`flex items-center space-x-2 px-6 py-3 rounded-xl font-medium transition-colors ${
                            isListening
                              ? 'bg-red-600 text-white hover:bg-red-700'
                              : 'bg-green-600 text-white hover:bg-green-700'
                          }`}
                          whileTap={{ scale: 0.95 }}
                          animate={isListening ? { scale: [1, 1.05, 1] } : {}}
                          transition={{ repeat: isListening ? Infinity : 0, duration: 1 }}
                        >
                          {isListening ? <MicOff size={20} /> : <Mic size={20} />}
                          <span>{isListening ? 'Stop Recording' : 'Start Voice Dictation'}</span>
                        </motion.button>
                      </div>
                    )}
                    
                    <button
                      onClick={handleCreateNote}
                      disabled={!noteContent.trim() || noteContent.includes('[Speaking...]') || isProcessing}
                      className="w-full flex items-center justify-center space-x-2 py-3 px-4 bg-blue-600 text-white rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 size={18} className="animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <Type size={18} />
                          <span>Save Note</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {captureMode === 'youtube' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        YouTube URL
                      </label>
                      <div className="relative">
                        <input
                          type="url"
                          value={youtubeUrl}
                          onChange={(e) => setYoutubeUrl(e.target.value)}
                          placeholder="https://www.youtube.com/watch?v=..."
                          className="w-full pl-10 pr-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:border-red-400 focus:outline-none transition-colors"
                          disabled={isProcessing}
                        />
                        <LinkIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                      </div>
                    </div>
                    
                    <button
                      onClick={handleCreateNote}
                      disabled={!youtubeUrl.trim() || isProcessing}
                      className="w-full flex items-center justify-center space-x-2 py-3 px-4 bg-red-600 text-white rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-700 transition-colors"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 size={18} className="animate-spin" />
                          <span>Processing...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={18} />
                          <span>Analyze Video</span>
                        </>
                      )}
                    </button>
                    
                    <p className="text-xs text-gray-500 text-center">
                      AI will transcribe, analyze, and create comprehensive notes from the video
                    </p>
                  </div>
                )}

                {/* Progress Indicator */}
                {progress && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-200"
                  >
                    <div className="flex items-center space-x-3 mb-2">
                      <Loader2 size={16} className="animate-spin text-blue-600" />
                      <span className="text-sm font-medium text-blue-900">
                        {progress.message}
                      </span>
                    </div>
                    <div className="w-full bg-blue-200 rounded-full h-2">
                      <motion.div
                        className="bg-blue-600 h-2 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${progress.percentage}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}