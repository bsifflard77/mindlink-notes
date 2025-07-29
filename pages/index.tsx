import React, { useState, useRef, useEffect } from 'react';
import { useUser, useSupabaseClient } from '@supabase/auth-helpers-react';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { Plus, Brain, Menu, Mic, MicOff, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Home() {
  const user = useUser();
  const supabase = useSupabaseClient();
  const [notes, setNotes] = useState<any[]>([]);
  const [showCapture, setShowCapture] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [isListening, setIsListening] = useState(false);
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

          setNoteContent(prev => {
            // Remove any previous interim results and add new ones
            const withoutInterim = prev.replace(/\[Speaking...\].*$/, '').trim();
            const newContent = withoutInterim + (withoutInterim ? ' ' : '') + finalTranscript;
            
            if (interimTranscript) {
              return newContent + (newContent ? ' ' : '') + `[Speaking...] ${interimTranscript}`;
            }
            
            return newContent;
          });
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
          // Clean up any interim results
          setNoteContent(prev => prev.replace(/\[Speaking...\].*$/, '').trim());
        };
      }
    }
  }, []);

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

  // Simple note creation function
  const createNote = async () => {
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
    stopListening();
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
              {speechSupported 
                ? "Tap + to type or 🎤 to speak your thoughts"
                : "Tap + to create your first note"
              }
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => setShowCapture(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg"
              >
                <Plus size={18} />
                <span>Type Note</span>
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
                  <span className="text-xs text-gray-500 uppercase tracking-wide">
                    {note.metadata?.created_via === 'voice' ? '🎤 Voice' : '📝 Text'}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(note.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-gray-900">{note.content}</p>
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
                <h2 className="text-lg font-semibold text-gray-900">Create Note</h2>
                <button
                  onClick={closeCapture}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-full"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 p-4">
                <textarea
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Type your thoughts or use voice dictation..."
                  className="w-full h-32 p-4 border-2 border-gray-200 rounded-xl resize-none focus:border-blue-400 focus:outline-none"
                />

                {speechSupported && (
                  <div className="flex items-center justify-center mt-4">
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

                <div className="flex space-x-3 mt-6">
                  <button
                    onClick={closeCapture}
                    className="flex-1 py-3 px-4 bg-gray-200 text-gray-800 rounded-xl font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={createNote}
                    disabled={!noteContent.trim() || noteContent.includes('[Speaking...]')}
                    className="flex-1 py-3 px-4 bg-blue-600 text-white rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Save Note
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}