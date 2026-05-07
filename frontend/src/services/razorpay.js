/**
 * Razorpay checkout loader. Pulls the official checkout.js once per
 * page load and resolves with `window.Razorpay`. The caller passes the
 * order details + a `handler` callback for the success path.
 */
const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
let scriptPromise = null;

export function loadRazorpay() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Razorpay must run in a browser'));
  }
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.Razorpay));
      existing.addEventListener('error', () => reject(new Error('Failed to load Razorpay')));
      return;
    }
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve(window.Razorpay);
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error('Failed to load Razorpay'));
    };
    document.body.appendChild(s);
  });
  return scriptPromise;
}

/**
 * Open the Razorpay checkout with the given order. `options` should be
 * the standard Razorpay init payload (key, order_id, amount, etc.) plus
 * `onSuccess` / `onDismiss` callbacks. Wraps the script load + the
 * window.Razorpay instantiation in one promise-friendly call.
 */
export async function openRazorpayCheckout({ onSuccess, onDismiss, ...rzOptions }) {
  const Razorpay = await loadRazorpay();
  const rz = new Razorpay({
    ...rzOptions,
    handler: (response) => onSuccess?.(response),
    modal: {
      ...(rzOptions.modal || {}),
      ondismiss: () => onDismiss?.(),
    },
  });
  rz.on?.('payment.failed', (resp) => {
    const err = resp?.error;
    onDismiss?.(err?.description || 'Payment failed');
  });
  rz.open();
  return rz;
}
