import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../../shared/types';
import { Send, MessageSquare, X, Bell } from 'lucide-react';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  unreadCount?: number;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  onSendMessage,
  isOpen,
  onToggle,
  unreadCount = 0,
}) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText);
    setInputText('');
  };

  const quickEmojis = ['🔥', '🎉', '😱', '🃏', '😂', '💀', '👏', '👀'];

  return (
    <>
      {/* Floating Chat Trigger Button */}
      <button
        onClick={onToggle}
        className="fixed bottom-4 right-4 z-40 bg-slate-800/90 hover:bg-slate-700 text-amber-400 p-3 rounded-full shadow-2xl border border-amber-400/40 backdrop-blur-md transition-transform hover:scale-105 active:scale-95 flex items-center justify-center cursor-pointer"
        title="Chat & Activity"
      >
        <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6" />
        {unreadCount > 0 && !isOpen && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[11px] font-bold w-5 h-5 rounded-full flex items-center justify-center animate-bounce">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Slide-over / Popup Chat Box */}
      {isOpen && (
        <div className="fixed bottom-18 right-4 z-40 w-80 sm:w-92 h-96 bg-slate-900/95 border-2 border-slate-700/80 rounded-2xl shadow-2xl backdrop-blur-xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200">
          {/* Header */}
          <div className="p-3 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-amber-400" />
              <h4 className="text-sm font-bold text-white font-['Outfit']">Room Chat & Log</h4>
            </div>
            <button
              onClick={onToggle}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages list */}
          <div className="flex-1 p-3 overflow-y-auto space-y-2 text-xs">
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-center text-xs">
                No messages yet. Say hi!
              </div>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={`p-2 rounded-xl text-xs break-words ${
                    m.isSystem
                      ? 'bg-amber-950/40 border border-amber-600/30 text-amber-200/90 font-medium'
                      : 'bg-slate-800/80 border border-slate-700 text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                    <span className={`font-semibold ${m.isSystem ? 'text-amber-400 font-bold' : 'text-sky-300'}`}>
                      {m.senderName}
                    </span>
                    <span>
                      {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div>{m.text}</div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick emoji bar */}
          <div className="px-2 py-1 bg-slate-950/50 border-t border-slate-800/60 flex items-center gap-1 overflow-x-auto">
            {quickEmojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onSendMessage(emoji)}
                className="text-sm hover:scale-125 transition-transform p-1 cursor-pointer"
              >
                {emoji}
              </button>
            ))}
          </div>

          {/* Input Form */}
          <form onSubmit={handleSubmit} className="p-2 bg-slate-800/90 border-t border-slate-700 flex gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Send message..."
              maxLength={120}
              className="flex-1 bg-slate-950 text-white text-xs px-3 py-2 rounded-xl border border-slate-700 focus:outline-none focus:border-amber-400"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 p-2 rounded-xl font-bold flex items-center justify-center transition cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
};
