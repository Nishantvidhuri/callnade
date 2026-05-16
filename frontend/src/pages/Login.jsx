import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Check } from 'lucide-react';
import { api } from '../services/api.js';
import { useAuthStore } from '../stores/auth.store.js';
import AuthLayout from '../components/AuthLayout.jsx';
import PasswordInput from '../components/PasswordInput.jsx';
import { AuthField, IconInput } from '../components/AuthField.jsx';

const linkCls = 'text-ink font-bold underline underline-offset-2';
const ctaCls =
  'w-full px-4 py-3.5 text-base font-semibold rounded-full text-white bg-ink h-[52px] flex items-center justify-center hover:bg-neutral-800 active:translate-y-[1px] disabled:opacity-70 disabled:cursor-not-allowed transition';

export default function Login() {
  const nav = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [agree, setAgree] = useState(true);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!agree) return setError('Please accept the Terms to continue.');
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', form);
      useAuthStore.getState().setAuth(data);
      // Always land on home after login. Previously we honored
      // `loc.state.from` (the page they were trying to reach when
      // RequireAuth bounced them here) — but the product wants the
      // home tab as the post-login starting point regardless.
      nav('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // One-tap guest signup. Backend creates a real User row with
  // isGuest:true + a random email/username and a non-recoverable
  // password. Same access/refresh token pair, so all auth'd pages
  // work without a separate code path.
  const continueAsGuest = async () => {
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post('/auth/guest');
      useAuthStore.getState().setAuth(data);
      nav('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Could not create a guest account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      tone="warm"
      title="Log in"
      subtitle={
        <>
          Don't have an account?{' '}
          <Link to="/signup" className={linkCls}>Create an Account</Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <AuthField label="Email or username">
          <IconInput
            icon={Mail}
            // `text` (not `email`) so the browser doesn't reject a
            // bare username. Backend accepts either — the `@` in the
            // value is what decides which field it queries on.
            type="text"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="you@example.com or your username"
            autoComplete="username"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </AuthField>

        <div className="flex flex-col gap-1.5 text-sm">
          <span className="font-semibold text-ink">Password</span>
          <PasswordInput
            placeholder="Password"
            autoComplete="current-password"
            required
            minLength={6}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <Link to="#" className="self-end text-xs font-bold text-ink underline underline-offset-2">
            Forgot Password?
          </Link>
        </div>

        {error && (
          <div role="alert" className="px-4 py-2.5 rounded-2xl bg-rose-100 text-rose-800 border border-rose-200 text-sm">
            {error}
          </div>
        )}

        <button type="submit" className={ctaCls} disabled={loading}>
          {loading ? <Spinner /> : 'Log in'}
        </button>

        {/* Guest path — no form fields needed, server mints a
            disposable account with 40 demo credits so the visitor
            can try the platform immediately. */}
        <button
          type="button"
          onClick={continueAsGuest}
          disabled={loading}
          className="w-full px-4 py-3 text-sm font-semibold rounded-full border border-neutral-300 bg-white text-ink hover:bg-neutral-50 active:translate-y-[1px] disabled:opacity-50 transition"
        >
          Continue as Guest
        </button>
        <p className="text-[11px] text-neutral-500 text-center -mt-1">
          Free 40 credits to try out a call · no email needed
        </p>

        <Checkbox checked={agree} onChange={setAgree}>
          I agree to the <a href="#" className={linkCls}>Terms &amp; Condition</a>
        </Checkbox>
      </form>
    </AuthLayout>
  );
}

function Checkbox({ checked, onChange, children }) {
  return (
    <div className="flex items-center gap-2.5 text-sm text-ink select-none">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="w-[18px] h-[18px] border-[1.5px] border-ink rounded grid place-items-center bg-white shrink-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-black/20"
      >
        {checked && <Check size={14} strokeWidth={3} className="text-ink" />}
      </button>
      <span>{children}</span>
    </div>
  );
}


function Spinner() {
  return (
    <span className="w-[18px] h-[18px] rounded-full border-2 border-white/30 border-t-white animate-spin" />
  );
}
