import { useEffect, useState } from 'react';
import {
  ShieldCheck, Camera, FileText, Download, AlertTriangle,
  Mail, Calendar, Wallet, Sparkles, User as UserIcon, Shield, Ban, Trash2,
} from 'lucide-react';
import { fmtCredits } from '../utils/formatCredits.js';
import { api } from '../services/api.js';

/**
 * Admin-only inline panel rendered on a user's public profile when the
 * viewer is an admin. Loads + previews the user's live verification selfie
 * and the consent PDF on file. Hidden for non-admins.
 */
export default function AdminProfileInsert({ userId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [verifyUrl, setVerifyUrl] = useState(null);
  const [verifyError, setVerifyError] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfError, setPdfError] = useState(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setData(null);
    setError(null);
    api
      .get(`/admin/users/${userId}/details`)
      .then((r) => !cancelled && setData(r.data))
      .catch((e) => !cancelled && setError(e.message));
    return () => { cancelled = true; };
  }, [userId]);

  // Fetch verification + consent attachments as blobs (with auth) and turn
  // them into local object URLs the <img>/<iframe> tags can load without
  // sending Authorization themselves.
  //
  // We deliberately don't URL.revokeObjectURL on cleanup — the browser
  // garbage-collects blob URLs on page navigation, and revoking too eagerly
  // races with React's render pipeline (causing a "broken image" if the
  // <img> mounts after the URL was already freed). A few KB leak per
  // session is fine.
  useEffect(() => {
    if (!data) return;
    let cancelled = false;

    if (data.verificationUrl) {
      api
        .get(data.verificationUrl.replace('/api/v1', ''), { responseType: 'blob' })
        .then((r) => {
          if (cancelled) return;
          const blob = r.data;
          if (!blob || blob.size === 0) {
            setVerifyError('Photo is empty or has not finished processing yet.');
            return;
          }
          if (!blob.type.startsWith('image/')) {
            setVerifyError(`Server returned ${blob.type || 'unknown'} instead of an image.`);
            return;
          }
          setVerifyUrl(URL.createObjectURL(blob));
        })
        .catch((e) => {
          if (!cancelled) setVerifyError(e.message || 'Failed to load verification photo.');
        });
    }
    if (data.consent?.pdfUrl) {
      api
        .get(data.consent.pdfUrl.replace('/api/v1', ''), { responseType: 'blob' })
        .then((r) => {
          if (cancelled) return;
          const blob = r.data;
          if (!blob || blob.size === 0) {
            setPdfError('Consent PDF is empty.');
            return;
          }
          setPdfUrl(URL.createObjectURL(blob));
        })
        .catch((e) => {
          if (!cancelled) setPdfError(e.message || 'Failed to load consent PDF.');
        });
    }

    return () => { cancelled = true; };
  }, [data]);

  if (error) {
    return (
      <div className="my-6 p-3 rounded-2xl bg-rose-50 border border-rose-100 text-rose-700 text-sm flex items-start gap-2">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <span>Admin view: {error}</span>
      </div>
    );
  }

  return (
    <section className="my-6 rounded-3xl border-2 border-dashed border-brand-200 bg-brand-50/40 p-4 sm:p-5">
      <header className="flex items-center gap-2 mb-3">
        <span className="w-7 h-7 rounded-full bg-brand-500 grid place-items-center text-white shrink-0">
          <ShieldCheck size={14} />
        </span>
        <p className="text-[11px] font-bold uppercase tracking-wide text-brand-600">
          Admin view
        </p>
        <p className="text-[11px] text-neutral-500 truncate">
          Only visible to platform admins.
        </p>
      </header>

      {/* Account summary — works for any user type, populated even when
          verification + consent are missing. */}
      {data && (
        <div className="mb-4 rounded-2xl border border-neutral-200 bg-white p-4">
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <RoleChip role={data.role} />
            {data.banned && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-rose-100 text-rose-600">
                <Ban size={10} /> BANNED
              </span>
            )}
            {data.deletedAt && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-neutral-200 text-neutral-700">
                <Trash2 size={10} /> DELETED
              </span>
            )}
            {data.verifiedAt && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-700">
                <ShieldCheck size={10} /> VERIFIED
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2.5 text-[12px]">
            <Cell label="Email" icon={Mail}>{data.email || '—'}</Cell>
            <Cell label="DOB" icon={Calendar}>{fmtDate(data.dateOfBirth) || '—'}</Cell>
            <Cell label="Joined" icon={Sparkles}>{fmtDate(data.createdAt) || '—'}</Cell>
            <Cell label="Last seen" icon={UserIcon}>{fmtDate(data.lastSeenAt) || '—'}</Cell>
            <Cell label="Wallet" icon={Wallet}>
              <span className="text-emerald-700 font-bold">
                {fmtCredits(data.walletBalance ?? 0)}
              </span>{' '}
              credits
            </Cell>
            {(data.role === 'provider' || data.role === 'admin') && (
              <Cell label="Earnings" icon={Wallet}>
                <span className="text-amber-700 font-bold">
                  {fmtCredits(data.earningsBalance ?? 0)}
                </span>{' '}
                credits
              </Cell>
            )}
          </div>
        </div>
      )}

      {/* Verification selfie */}
      <div className="mb-4">
        <p className="text-xs font-bold mb-1.5 inline-flex items-center gap-1.5">
          <Camera size={12} className="text-brand-600" /> Live verification selfie
          {data?.verifiedAt && (
            <span className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-700">
              <ShieldCheck size={10} /> Verified · {fmt(data.verifiedAt)}
            </span>
          )}
        </p>
        <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden grid place-items-center min-h-[200px]">
          {!data ? (
            <p className="text-sm text-neutral-400 py-10">Loading…</p>
          ) : !data.hasVerificationPhoto ? (
            <p className="text-sm text-neutral-500 py-10 px-6 text-center">
              No verification photo on file (account predates live verification).
            </p>
          ) : verifyError ? (
            <div className="text-sm py-10 px-6 text-center text-rose-600">
              <AlertTriangle size={18} className="mx-auto mb-2" />
              <p className="font-semibold">Couldn't load photo</p>
              <p className="text-xs text-neutral-500 mt-1">{verifyError}</p>
            </div>
          ) : !verifyUrl ? (
            <p className="text-sm text-neutral-400 py-10">Loading photo…</p>
          ) : (
            <img
              src={verifyUrl}
              alt="Live verification selfie"
              onError={() => setVerifyError('The image data is corrupt or not a valid image file.')}
              className="max-h-[360px] w-auto object-contain"
            />
          )}
        </div>
      </div>

      {/* Consent record */}
      <div>
        <p className="text-xs font-bold mb-1.5 inline-flex items-center gap-1.5">
          <FileText size={12} className="text-brand-600" /> Consent &amp; community guidelines
        </p>
        {!data?.consent || (!data.consent.acceptedAt && !data.consent.fullName) ? (
          <p className="text-sm text-neutral-500 py-3 px-3 rounded-2xl border border-neutral-200 bg-white">
            No consent record on this account (predates the consent flow).
          </p>
        ) : (
          <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 bg-neutral-50 text-[12px]">
              <Cell label="Full name">{data.consent.fullName || '—'}</Cell>
              <Cell label="Signature">
                <span className="italic" style={{ fontFamily: 'cursive' }}>
                  {data.consent.signature || '—'}
                </span>
              </Cell>
              <Cell label="Accepted at">{fmt(data.consent.acceptedAt) || '—'}</Cell>
              <Cell label="Document version">{data.consent.version || '—'}</Cell>
              <Cell label="Recorded IP">
                <span className="font-mono">{data.consent.ip || '—'}</span>
              </Cell>
              <Cell label="PDF size">
                {data.consent.pdfBytes ? `${(data.consent.pdfBytes / 1024).toFixed(1)} KB` : '—'}
              </Cell>
            </div>

            {data.consent.hasPdf ? (
              pdfUrl ? (
                <div className="border-t border-neutral-200">
                  <iframe
                    src={pdfUrl}
                    title="Consent PDF"
                    className="w-full h-[55dvh] bg-white"
                  />
                  <div className="px-3 py-2 border-t border-neutral-200 flex items-center justify-end">
                    <a
                      href={pdfUrl}
                      download={`consent-${data.username}.pdf`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full bg-ink text-white hover:bg-neutral-800 transition"
                    >
                      <Download size={12} /> Download PDF
                    </a>
                  </div>
                </div>
              ) : (
                <p className="px-4 py-5 text-center text-sm text-neutral-400 border-t border-neutral-200">
                  Loading PDF…
                </p>
              )
            ) : (
              <p className="px-4 py-5 text-center text-sm text-neutral-500 border-t border-neutral-200">
                No PDF on record (account predates PDF generation).
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function Cell({ label, children, icon: Icon }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500 inline-flex items-center gap-1">
        {Icon && <Icon size={10} />} {label}
      </p>
      <p className="text-[13px] text-ink truncate mt-0.5">{children}</p>
    </div>
  );
}

function RoleChip({ role }) {
  const r = role || 'user';
  const styles = {
    admin: 'bg-brand-100 text-brand-600',
    provider: 'bg-amber-100 text-amber-700',
    user: 'bg-neutral-100 text-neutral-600',
  }[r];
  const Icon = r === 'admin' ? Shield : r === 'provider' ? Sparkles : UserIcon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wide ${styles}`}
    >
      <Icon size={10} fill={r === 'provider' ? 'currentColor' : undefined} />
      {r}
    </span>
  );
}

function fmt(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function fmtDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
