function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden className="shrink-0">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5Z" />
      <path fill="#FF3D00" d="m6.3 14.1 6.6 4.8C14.7 15 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.6 8.4 6.3 14.1Z" />
      <path fill="#4CAF50" d="M24 44c5.3 0 10.2-2 13.8-5.4l-6.4-5.4c-2 1.4-4.6 2.3-7.4 2.3-5.2 0-9.6-3.3-11.2-8l-6.6 5.1C9.5 39.5 16.2 44 24 44Z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.4 5.4C41.8 35.4 44 30.1 44 24c0-1.3-.1-2.4-.4-3.5Z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <circle cx="12" cy="12" r="12" fill="#1877F2" />
      <path
        fill="#fff"
        d="M13.5 12.5h2l.4-2.6h-2.4V8.2c0-.7.2-1.2 1.3-1.2H16V4.7c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.1H8v2.6h2.1V20h3.4v-7.5Z"
      />
    </svg>
  );
}

const btnCls =
  'flex items-center justify-center gap-2 px-3 py-2.5 rounded-full border border-neutral-200 bg-white text-ink text-sm font-medium hover:bg-neutral-50 hover:border-neutral-300 transition whitespace-nowrap';

export default function SocialButtons({ onGoogle, onFacebook }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      <button type="button" className={btnCls} onClick={onGoogle}>
        <GoogleIcon />
        <span>Continue with Google</span>
      </button>
      <button type="button" className={btnCls} onClick={onFacebook}>
        <FacebookIcon />
        <span>Continue with Facebook</span>
      </button>
    </div>
  );
}
