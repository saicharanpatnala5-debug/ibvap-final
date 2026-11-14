import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Send,
  Mic,
  MicOff,
  ChevronUp,
  X,
  ShieldAlert,
  Bot,
  CornerDownLeft,
} from 'lucide-react';
import { AlertIncident, CameraFeedItem } from '../types';

interface CommandBarProps {
  cameras: CameraFeedItem[];
  alerts: AlertIncident[];
  onExecuteQuery: (query: string) => void;
  onOpenCommandCenter: () => void;
  isOpen?: boolean;
}

export const CommandBar: React.FC<CommandBarProps> = ({
  cameras,
  alerts,
  onExecuteQuery,
  onOpenCommandCenter,
}) => {
  const [query, setQuery] = useState('');
  const [isListening, setIsListening] = useState(false);
  const speechRef = useRef<any>(null);

  const criticalCount = alerts.filter(
    (a) => (a.severity === 'critical' || a.riskScore >= 70) && a.status === 'active'
  ).length;

  // Keyboard shortcut listener: Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const input = document.getElementById('persistent-command-input');
        if (input) {
          input.focus();
        } else {
          onOpenCommandCenter();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpenCommandCenter]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    onExecuteQuery(query.trim());
    setQuery('');
  };

  const handleToggleVoice = () => {
    if (isListening) {
      speechRef.current?.stop();
      setIsListening(false);
      return;
    }
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech Recognition is not supported on this browser.');
      return;
    }
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (e: any) => {
        const text = e.results[0][0].transcript;
        if (text) {
          onExecuteQuery(text);
          setQuery('');
        }
        setIsListening(false);
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);
      speechRef.current = recognition;
      recognition.start();
    } catch (err) {
      setIsListening(false);
    }
  };

  return (
    <div
      id="persistent-command-bar"
      className="fixed bottom-3 left-1/2 -translate-x-1/2 z-30 w-full max-w-2xl px-4"
    >
      <div className="flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950/90 p-1.5 shadow-2xl backdrop-blur-md">
        {/* Left AI Icon & Badge */}
        <button
          type="button"
          onClick={onOpenCommandCenter}
          className="flex items-center gap-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 px-2.5 py-1.5 text-xs font-semibold text-amber-400 transition-colors shrink-0"
          title="Open Full AI Command Center"
        >
          <Sparkles className="h-4 w-4" />
          <span className="hidden sm:inline">AI Command</span>
          {criticalCount > 0 && (
            <span className="rounded-full bg-red-950 border border-red-800 px-1.5 text-[10px] font-mono text-red-300">
              {criticalCount}
            </span>
          )}
        </button>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="flex-1 flex items-center gap-1.5">
          <input
            id="persistent-command-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Ask your live surveillance data (e.g. "Show critical alerts", "Investigate event #1")...'
            className="w-full bg-transparent px-2 text-xs sm:text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none"
          />

          {/* Voice Mic Button */}
          <button
            type="button"
            onClick={handleToggleVoice}
            title={isListening ? 'Stop' : 'Voice Query'}
            className={`rounded-lg p-1.5 transition-colors shrink-0 ${
              isListening
                ? 'bg-red-950 text-red-400 animate-pulse'
                : 'text-neutral-400 hover:bg-neutral-900 hover:text-white'
            }`}
          >
            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>

          {/* Send */}
          <button
            type="submit"
            disabled={!query.trim()}
            className="flex items-center gap-1 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-30 disabled:pointer-events-none px-2.5 py-1.5 text-xs font-semibold text-neutral-950 transition-colors shrink-0"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </form>

        {/* Expand full center button */}
        <button
          type="button"
          onClick={onOpenCommandCenter}
          className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200 transition-colors shrink-0"
          title="Expand Command Center"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
