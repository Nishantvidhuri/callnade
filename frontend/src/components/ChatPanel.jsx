import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Video } from 'lucide-react';
import { useAuthStore } from '../stores/auth.store.js';
import { useChatStore } from '../stores/chat.store.js';
import { getSocket } from '../services/socket.js';
import { enterFullscreenOnMobile } from '../utils/fullscreen.js';
import PackagePickerModal from './PackagePickerModal.jsx';

export default function ChatPanel({ peer, onBack }) {
  const me = useAuthStore((s) => s.user);
  const nav = useNavigate();
  const setDrawerOpen = useChatStore((s) => s.setDrawerOpen);
  const messages = useChatStore((s) => s.conversations[String(peer.id)] || []);
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const scrollRef = useRef(null);

  // Anyone can message anyone — no subscription gate, so no "blocked" state.
  useEffect(() => {
    setError(null);
  }, [peer.id]);

  const startCall = () => {
    setPickerOpen(true);
  };

  const startCallWithPackage = (packageId) => {
    setDrawerOpen(false);
    enterFullscreenOnMobile();
    const qs = packageId ? `?package=${packageId}` : '';
    nav(`/call/${peer.id}${qs}`);
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  const send = (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    const socket = getSocket();
    socket.emit('chat:send', { toUserId: peer.id, text: trimmed }, (ack) => {
      if (ack?.error) setError(ack.error);
    });
    setText('');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-200">
        <button
          onClick={onBack}
          className="w-8 h-8 grid place-items-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-ink transition"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="relative shrink-0">
          {peer.avatarUrl ? (
            <img src={peer.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-brand-100 grid place-items-center text-xs font-medium text-brand-600">
              {(peer.displayName || peer.username).charAt(0).toUpperCase()}
            </div>
          )}
          {peer.online && (
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm truncate">{peer.displayName || peer.username}</p>
          <p className="text-xs truncate">
            {peer.online ? (
              <span className="text-emerald-600">Online</span>
            ) : (
              <span className="text-neutral-500">@{peer.username}</span>
            )}
          </p>
        </div>
        {me?.role !== 'provider' && (
          <button
            onClick={startCall}
            aria-label="Start video call"
            className="w-9 h-9 grid place-items-center rounded-full text-brand-600 hover:bg-brand-50 transition"
          >
            <Video size={18} strokeWidth={1.8} />
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {messages.length === 0 ? (
          <p className="text-center text-xs text-neutral-400 mt-10">
            Say hi to {peer.displayName || peer.username}
          </p>
        ) : (
          messages.map((m) => {
            const mine = String(m.from.id) === String(me?._id);
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[75%] px-3.5 py-2 rounded-2xl text-sm leading-snug ${
                    mine
                      ? 'bg-tinder text-white rounded-br-sm shadow-tinder/30'
                      : 'bg-neutral-100 text-ink rounded-bl-sm'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            );
          })
        )}
      </div>

      {error && (
        <div className="px-4 py-2 text-xs text-rose-700 bg-rose-50 border-t border-rose-100">
          {error}
        </div>
      )}

      <form onSubmit={send} className="flex items-center gap-2 p-3 border-t border-neutral-200">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message"
          className="flex-1 px-4 py-2 rounded-full bg-neutral-100 text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-brand-100 focus:border focus:border-brand-300 transition"
          maxLength={1000}
        />
        <button
          type="submit"
          disabled={!text.trim()}
          aria-label="Send"
          className="w-10 h-10 grid place-items-center rounded-full bg-tinder text-white disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-110 transition"
        >
          <Send size={16} />
        </button>
      </form>

      <PackagePickerModal
        peer={peer}
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onStart={startCallWithPackage}
      />
    </div>
  );
}
