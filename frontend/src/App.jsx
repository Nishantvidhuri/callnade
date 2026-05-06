import { useEffect, useState } from 'react';
import { Routes, Route, useLocation, matchPath } from 'react-router-dom';
import { useAuth, bootstrapAuth } from './hooks/useAuth.js';
import { useChatSocket } from './hooks/useChatSocket.js';
import { useNotifications } from './hooks/useNotifications.js';
import { useIncomingCalls } from './hooks/useIncomingCalls.js';
import RequireAuth from './components/RequireAuth.jsx';
import ChatFab from './components/ChatFab.jsx';
import ChatDrawer from './components/ChatDrawer.jsx';
import LoginPromptModal from './components/LoginPromptModal.jsx';
import AgeGateModal from './components/AgeGateModal.jsx';
import BecomeCreatorButton from './components/BecomeCreatorButton.jsx';

import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import Profile from './pages/Profile.jsx';
import Settings from './pages/Settings.jsx';
import Calls from './pages/Calls.jsx';
import Notifications from './pages/Notifications.jsx';
import Admin from './pages/Admin.jsx';
import Call from './pages/Call.jsx';
import IncomingCall from './pages/IncomingCall.jsx';
import AdminSpectate from './pages/AdminSpectate.jsx';
import NotFound from './pages/NotFound.jsx';

const CHROMELESS = [
  '/login',
  '/signup',
  '/call/:peerId',
  '/call/incoming/:callId',
  '/admin/call/:callId/spectate',
];

export default function App() {
  const { isAuthed } = useAuth();
  const [booted, setBooted] = useState(false);
  const loc = useLocation();
  const chromeless = CHROMELESS.some((p) => matchPath(p, loc.pathname));

  useChatSocket();
  useNotifications();
  useIncomingCalls();

  useEffect(() => {
    bootstrapAuth().finally(() => setBooted(true));
  }, []);

  if (!booted) {
    return (
      <div className="min-h-[100dvh] grid place-items-center bg-[#fff5f9]">
        <div className="w-10 h-10 rounded-full border-4 border-pink-200 border-t-brand-500 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/popular" element={<Home />} />
        <Route path="/liked" element={<RequireAuth><Home /></RequireAuth>} />
        <Route path="/requests" element={<RequireAuth><Home /></RequireAuth>} />
        <Route path="/chat" element={<RequireAuth><Home /></RequireAuth>} />
        <Route path="/u/:username" element={<RequireAuth><Profile /></RequireAuth>} />
        <Route path="/calls" element={<RequireAuth><Calls /></RequireAuth>} />
        <Route path="/notifications" element={<RequireAuth><Notifications /></RequireAuth>} />
        <Route path="/admin" element={<RequireAuth><Admin /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
        <Route path="/call/:peerId" element={<RequireAuth><Call /></RequireAuth>} />
        <Route path="/call/incoming/:callId" element={<RequireAuth><IncomingCall /></RequireAuth>} />
        <Route path="/admin/call/:callId/spectate" element={<RequireAuth><AdminSpectate /></RequireAuth>} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="*" element={<NotFound />} />
      </Routes>

      {isAuthed && !chromeless && (
        <>
          <ChatFab />
          <ChatDrawer />
        </>
      )}

      {!chromeless && <LoginPromptModal />}
      {!isAuthed && !chromeless && <AgeGateModal />}
      {!chromeless && <BecomeCreatorButton />}
    </>
  );
}
