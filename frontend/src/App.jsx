import { useEffect, useState } from 'react';
import { Routes, Route, useLocation, matchPath, Navigate } from 'react-router-dom';
import { useAuth, bootstrapAuth } from './hooks/useAuth.js';
import { useNotifications } from './hooks/useNotifications.js';
import { useIncomingCalls } from './hooks/useIncomingCalls.js';
import { useWalletSync } from './hooks/useWalletSync.js';
import { usePresenceSync } from './hooks/usePresenceSync.js';
import { forceLogVisit } from './services/visit.js';
import RequireAuth from './components/RequireAuth.jsx';
import LoginPromptModal from './components/LoginPromptModal.jsx';

import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import Profile from './pages/Profile.jsx';
// Settings page merged into Profile — keep the import path resolvable
// in case anything else references it, but the route below redirects to
// /u/{me.username} so users land on the unified profile + settings view.
import Calls from './pages/Calls.jsx';
import Notifications from './pages/Notifications.jsx';
import Admin from './pages/Admin.jsx';
import AdminVisits from './pages/AdminVisits.jsx';
import AdminWalletRequests from './pages/AdminWalletRequests.jsx';
import AdminPaymentQrs from './pages/AdminPaymentQrs.jsx';
import Billing from './pages/Billing.jsx';
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
  const { user } = useAuth();
  const [booted, setBooted] = useState(false);
  const loc = useLocation();
  const chromeless = CHROMELESS.some((p) => matchPath(p, loc.pathname));

  useNotifications();
  useIncomingCalls();
  useWalletSync();
  usePresenceSync();

  useEffect(() => {
    bootstrapAuth().finally(() => setBooted(true));
  }, []);

  // Fade out the index.html splash once auth has bootstrapped — the
  // logo stays put while we hydrate the user, instead of flashing a
  // generic spinner. Two rAFs so the routed page has a frame to paint
  // before the cross-fade starts.
  useEffect(() => {
    if (!booted) return;
    const splash = document.getElementById('splash');
    if (!splash) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        splash.classList.add('is-hidden');
        // Match the CSS transition (320ms in index.html); +40ms slack.
        setTimeout(() => splash.remove(), 360);
      });
    });
  }, [booted]);

  // Fire a visit log on every navigation (and on the very first load
  // once auth has booted, so the row reflects the right userId when the
  // visitor was already signed in via refresh-token cookie). One row
  // per pathname change — the admin gets a full breadcrumb trail
  // instead of one row per session.
  useEffect(() => {
    if (!booted) return;
    forceLogVisit();
  }, [booted, user?._id, loc.pathname]);

  // Pre-boot: render nothing. The index.html splash (#splash) is still
  // covering the viewport, and the effect above will fade it out as
  // soon as `booted` flips true. Returning null here avoids a flash of
  // blank app chrome behind the splash.
  if (!booted) return null;

  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/popular" element={<Home />} />
        <Route path="/liked" element={<RequireAuth><Home /></RequireAuth>} />
        <Route path="/requests" element={<RequireAuth><Home /></RequireAuth>} />
        <Route path="/u/:username" element={<RequireAuth><Profile /></RequireAuth>} />
        <Route path="/calls" element={<RequireAuth><Calls /></RequireAuth>} />
        <Route path="/notifications" element={<RequireAuth><Notifications /></RequireAuth>} />
        <Route path="/admin" element={<RequireAuth><Admin /></RequireAuth>} />
        <Route path="/admin/visits" element={<RequireAuth><AdminVisits /></RequireAuth>} />
        <Route path="/admin/wallet-requests" element={<RequireAuth><AdminWalletRequests /></RequireAuth>} />
        <Route path="/admin/payment-qrs" element={<RequireAuth><AdminPaymentQrs /></RequireAuth>} />
        <Route path="/billing" element={<RequireAuth><Billing /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><SettingsRedirect /></RequireAuth>} />
        <Route path="/call/:peerId" element={<RequireAuth><Call /></RequireAuth>} />
        <Route path="/call/incoming/:callId" element={<RequireAuth><IncomingCall /></RequireAuth>} />
        <Route path="/admin/call/:callId/spectate" element={<RequireAuth><AdminSpectate /></RequireAuth>} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="*" element={<NotFound />} />
      </Routes>

      {!chromeless && <LoginPromptModal />}
      {/* AgeGateModal is now mounted inside Home.jsx so it pops up every
          time an anonymous visitor lands on the home page — the product
          wants per-visit confirmation, not the previous 24h cache. */}
    </>
  );
}

/**
 * /settings is now an alias of /u/<my-username>. The profile page hosts
 * the editable form + packages manager inline when the viewer is the
 * owner. This component just bounces the browser to the right URL.
 */
function SettingsRedirect() {
  const { user } = useAuth();
  if (!user?.username) return <Navigate to="/login" replace />;
  return <Navigate to={`/u/${user.username}`} replace />;
}
