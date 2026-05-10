import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Check } from 'lucide-react';
import { api } from '../services/api.js';
import { googleSignIn } from '../services/google.js';
import { useAuthStore } from '../stores/auth.store.js';
import AuthLayout from '../components/AuthLayout.jsx';
import PasswordInput from '../components/PasswordInput.jsx';
import SocialButtons from '../components/SocialButtons.jsx';
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

  const handleGoogle = async () => {
    if (!agree) return setError('Please accept the Terms to continue.');
    setError(null);
    setLoading(true);
    try {
      const idToken = await googleSignIn();
      const { data } = await api.post('/auth/google', { idToken });
      useAuthStore.getState().setAuth(data);
      // Always land on home after login. Previously we honored
      // `loc.state.from` (the page they were trying to reach when
      // RequireAuth bounced them here) — but the product wants the
      // home tab as the post-login starting point regardless.
      nav('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Google sign-in failed');
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
        <AuthField label="Email Address">
          <IconInput
            icon={Mail}
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
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

        <Checkbox checked={agree} onChange={setAgree}>
          I agree to the <a href="#" className={linkCls}>Terms &amp; Condition</a>
        </Checkbox>

        <Divider />

        <SocialButtons
          onGoogle={handleGoogle}
          onFacebook={() => setError('Facebook sign-in coming soon')}
        />
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

function Divider() {
  return (
    <div className="flex items-center gap-3 text-neutral-500 text-xs my-0.5">
      <span className="flex-1 h-px bg-neutral-200" />
      <span>or</span>
      <span className="flex-1 h-px bg-neutral-200" />
    </div>
  );
}

function Spinner() {
  return (
    <span className="w-[18px] h-[18px] rounded-full border-2 border-white/30 border-t-white animate-spin" />
  );
}
