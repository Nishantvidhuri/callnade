import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, RotateCw, Image as ImageIcon, Upload, Trash2, Check, X,
  AlertCircle,
} from 'lucide-react';
import { api } from '../services/api.js';
import { useAuthStore } from '../stores/auth.store.js';
import { disconnectSocket } from '../services/socket.js';
import HomeSidebar from '../components/HomeSidebar.jsx';
import HomeBottomBar from '../components/HomeBottomBar.jsx';
import MobileTopBar from '../components/MobileTopBar.jsx';

/**
 * Admin module to manage the pool of payment QR images shown on the
 * user-side topup form. Upload as many as you want; the topup page
 * picks one at random per page load. Toggle a QR off (Active → Off)
 * to retire it without deleting; delete to drop it from the pool
 * permanently (also removes the R2 object).
 */
export default function AdminPaymentQrs() {
  const me = useAuthStore((s) => s.user);
  const nav = useNavigate();
  const fileInput = useRef(null);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [zoom, setZoom] = useState(null);

  // Upload-modal state — lets the admin pick file + label + UPI ID
  // before kicking off the actual POST. Without this the file input
  // would fire immediately on selection and there'd be no way to
  // attach a UPI handle.
  const [pickerFile, setPickerFile] = useState(null);
  const [pickerPreview, setPickerPreview] = useState(null);
  const [pickerLabel, setPickerLabel] = useState('');
  const [pickerUpi, setPickerUpi] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/admin/payment-qrs');
      setItems(data.items || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Stage the file in the upload modal so the admin can attach a
  // label + UPI before submitting.
  const onPickFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) {
      setError('Image must be JPEG, PNG, or WebP');
      return;
    }
    if (f.size > 4 * 1024 * 1024) {
      setError('Image too large (max 4MB)');
      return;
    }
    setError(null);
    if (pickerPreview) URL.revokeObjectURL(pickerPreview);
    setPickerFile(f);
    setPickerPreview(URL.createObjectURL(f));
    setPickerLabel(f.name.replace(/\.(jpg|jpeg|png|webp)$/i, '').slice(0, 80));
    setPickerUpi('');
  };

  const cancelPicker = () => {
    if (pickerPreview) URL.revokeObjectURL(pickerPreview);
    setPickerFile(null);
    setPickerPreview(null);
    setPickerLabel('');
    setPickerUpi('');
  };

  const submitPicker = async () => {
    if (!pickerFile) return;
    setBusy('upload');
    setError(null);
    try {
      const buf = await pickerFile.arrayBuffer();
      await api.post('/admin/payment-qrs', buf, {
        params: {
          label: pickerLabel || undefined,
          upiId: pickerUpi.trim() || undefined,
        },
        headers: { 'Content-Type': pickerFile.type },
        transformRequest: [(d) => d],
      });
      cancelPicker();
      load();
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (id, active) => {
    setBusy(id);
    setError(null);
    try {
      await api.patch(`/admin/payment-qrs/${id}`, { active });
      setItems((curr) => curr.map((q) => (q.id === id ? { ...q, active } : q)));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id) => {
    if (!confirm('Delete this QR? This removes it from the pool permanently.')) return;
    setBusy(id);
    setError(null);
    try {
      await api.delete(`/admin/payment-qrs/${id}`);
      setItems((curr) => curr.filter((q) => q.id !== id));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const onLogout = async () => {
    try { await api.post('/auth/logout'); } catch {}
    useAuthStore.getState().clear();
    disconnectSocket();
    nav('/login', { replace: true });
  };

  const activeCount = items.filter((q) => q.active).length;

  return (
    <div className="h-[100dvh] flex overflow-hidden bg-neutral-950 text-ink">
      <HomeSidebar me={me} onLogout={onLogout} />

      <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#fff5f9]">
        <MobileTopBar />
        <div className="px-4 sm:px-6 lg:px-8 pt-5 sm:pt-7 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
                <ImageIcon size={22} className="text-brand-500" /> Payment QRs
              </h1>
              <p className="text-sm text-neutral-500 mt-0.5">
                Pool of QR images shown on the user-side top-up form. One is
                picked at random per page load. {activeCount} active /{' '}
                {items.length} total.
              </p>
            </div>
            <Link
              to="/admin"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-full border border-neutral-200 bg-white hover:bg-neutral-50 transition shrink-0"
            >
              <ArrowLeft size={13} /> <span className="hidden sm:inline">Admin</span>
            </Link>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              title="Refresh"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-full border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 transition shrink-0"
            >
              <RotateCw size={13} className={loading ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 lg:px-8 pb-24 lg:pb-8">
          {error && (
            <div className="mb-3 px-4 py-2.5 bg-rose-50 border border-rose-100 text-rose-700 text-sm rounded-xl flex items-center gap-2">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          {/* Upload tile — opens the upload modal where admin attaches
              the QR's label + UPI ID before submitting. */}
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onPickFile}
            hidden
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy === 'upload'}
            className="w-full mb-4 rounded-2xl border-2 border-dashed border-neutral-300 hover:border-brand-300 hover:bg-brand-50/40 p-6 text-center transition disabled:opacity-50"
          >
            <Upload size={20} className="mx-auto text-neutral-500" />
            <p className="text-sm font-bold text-neutral-700 mt-1.5">
              {busy === 'upload' ? 'Uploading…' : 'Upload payment QR'}
            </p>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              JPEG, PNG, or WebP · up to 4MB · attach a UPI ID after picking
            </p>
          </button>

          {loading && items.length === 0 ? (
            <p className="text-sm text-neutral-400 text-center py-12">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-neutral-500 text-center py-12 bg-white rounded-2xl border border-neutral-200">
              No payment QRs yet. Upload one above to seed the pool.
            </p>
          ) : (
            <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {items.map((q) => (
                <li
                  key={q.id}
                  className={`rounded-2xl bg-white border p-3 ${
                    q.active ? 'border-emerald-200' : 'border-neutral-200 opacity-70'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setZoom(q.url)}
                    className="block w-full aspect-square rounded-xl overflow-hidden bg-neutral-50 border border-neutral-100 hover:opacity-90 transition"
                  >
                    <img
                      src={q.url}
                      alt={q.label || 'Payment QR'}
                      className="w-full h-full object-contain"
                      loading="lazy"
                    />
                  </button>
                  <p className="mt-2 text-xs font-semibold text-ink truncate">
                    {q.label || '—'}
                  </p>
                  {q.upiId && (
                    <p className="text-[10px] font-mono text-emerald-700 truncate">
                      {q.upiId}
                    </p>
                  )}
                  <p className="text-[10px] text-neutral-500">
                    {fmtDate(q.createdAt)}
                  </p>

                  <div className="mt-2 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => toggle(q.id, !q.active)}
                      disabled={busy === q.id}
                      className={`flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-bold rounded-full transition disabled:opacity-50 ${
                        q.active
                          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                          : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                      }`}
                    >
                      {q.active ? <Check size={11} /> : <X size={11} />}
                      {q.active ? 'Active' : 'Off'}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(q.id)}
                      disabled={busy === q.id}
                      title="Delete"
                      className="w-7 h-7 grid place-items-center rounded-full text-rose-700 hover:bg-rose-50 transition disabled:opacity-50"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <HomeBottomBar />

      {zoom && (
        <div
          className="fixed inset-0 z-[80] grid place-items-center p-4 bg-black/85 backdrop-blur-sm"
          onClick={() => setZoom(null)}
        >
          <button
            onClick={() => setZoom(null)}
            aria-label="Close"
            className="absolute top-4 right-4 w-10 h-10 rounded-full grid place-items-center bg-white/15 hover:bg-white/25 text-white"
          >
            <X size={18} />
          </button>
          <img
            src={zoom}
            alt=""
            onClick={(e) => e.stopPropagation()}
            className="max-w-md w-full rounded-2xl bg-white p-3 shadow-2xl"
          />
        </div>
      )}

      {/* Upload modal — staged after the file picker fires so the
          admin can attach a label + UPI ID before submitting. */}
      {pickerFile && (
        <div
          className="fixed inset-0 z-[80] grid place-items-center p-4 bg-black/55 backdrop-blur-sm"
          onClick={cancelPicker}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-white shadow-2xl overflow-hidden animate-[pop_150ms_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-5 py-4 flex items-center gap-3 bg-brand-500 text-white">
              <span className="w-9 h-9 rounded-full bg-white/20 grid place-items-center">
                <Upload size={18} strokeWidth={2.4} />
              </span>
              <h3 className="font-bold text-base flex-1">Upload payment QR</h3>
              <button
                type="button"
                onClick={cancelPicker}
                aria-label="Close"
                className="w-8 h-8 grid place-items-center rounded-full hover:bg-white/20 transition"
              >
                <X size={16} />
              </button>
            </header>

            <div className="px-5 py-4 space-y-3">
              {/* Live preview of the picked image so admin can confirm
                  it's the right file before committing. */}
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3 flex items-center gap-3">
                <img
                  src={pickerPreview}
                  alt=""
                  className="w-16 h-16 rounded-xl object-contain bg-white border border-neutral-200 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink truncate">
                    {pickerFile.name}
                  </p>
                  <p className="text-[11px] text-neutral-500">
                    {(pickerFile.size / 1024).toFixed(0)} KB · {pickerFile.type}
                  </p>
                </div>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold uppercase tracking-wide text-neutral-700">
                  Label <span className="text-neutral-400 normal-case font-medium">(optional)</span>
                </span>
                <input
                  type="text"
                  value={pickerLabel}
                  onChange={(e) => setPickerLabel(e.target.value)}
                  maxLength={80}
                  placeholder="e.g. Paytm primary"
                  className="w-full px-4 py-2.5 text-sm rounded-full bg-white border border-neutral-300 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold uppercase tracking-wide text-neutral-700">
                  UPI ID
                </span>
                <input
                  type="text"
                  value={pickerUpi}
                  onChange={(e) => setPickerUpi(e.target.value)}
                  maxLength={120}
                  placeholder="callnade@paytm"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  className="w-full px-4 py-2.5 text-sm font-mono rounded-full bg-white border border-neutral-300 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition"
                />
                <span className="text-[11px] text-neutral-500">
                  Shown under the QR on the user's top-up page so they can
                  copy-paste instead of scanning if they prefer.
                </span>
              </label>

              {error && (
                <div className="px-3.5 py-2 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-xs flex items-center gap-1.5">
                  <AlertCircle size={13} /> {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={cancelPicker}
                  disabled={busy === 'upload'}
                  className="px-4 py-2.5 text-sm font-semibold rounded-full border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 disabled:opacity-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitPicker}
                  disabled={busy === 'upload'}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-bold rounded-full text-white bg-brand-500 shadow-md shadow-brand-500/30 hover:bg-brand-600 disabled:opacity-50 transition"
                >
                  <Upload size={14} strokeWidth={2.4} />
                  {busy === 'upload' ? 'Uploading…' : 'Upload'}
                </button>
              </div>
            </div>
          </div>
          <style>{`@keyframes pop{from{transform:scale(0.94);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
        </div>
      )}
    </div>
  );
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}
