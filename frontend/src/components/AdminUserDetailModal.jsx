import { useEffect, useState } from 'react';
import { X, ShieldCheck, Camera, FileText, Download, AlertTriangle } from 'lucide-react';
import { api } from '../services/api.js';
import ConsentDocument from './ConsentDocument.jsx';

/**
 * Admin-only detail panel for a single user. Loads user info plus
 * private attachments — the live verification selfie they took at signup,
 * and the generated consent PDF — both fetched via authed XHR (so they
 * can't be loaded by anonymous viewers).
 */
export default function AdminUserDetailModal({ userId, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [verifyUrl, setVerifyUrl] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);

  // Fetch the user details JSON.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setData(null);
    setError(null);
    api
      .get(`/admin/users/${userId}/details`)
      .then((r) => {
        if (!cancelled) setData(r.data);
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => { cancelled = true; };
  }, [userId]);

  // Fetch the verification photo and consent PDF as blobs (authed XHR),
  // then render via blob: URLs so <img> and <iframe> can load them
  // without sending Authorization headers.
  useEffect(() => {
    if (!data) return;
    let revokeVerify = null;
    let revokePdf = null;

    if (data.verificationUrl) {
      api
        .get(data.verificationUrl.replace('/api/v1', ''), { responseType: 'blob' })
        .then((r) => {
          const url = URL.createObjectURL(r.data);
          setVerifyUrl(url);
          revokeVerify = () => URL.revokeObjectURL(url);
        })
        .catch(() => setVerifyUrl(null));
    }
    if (data.consent?.pdfUrl) {
      api
        .get(data.consent.pdfUrl.replace('/api/v1', ''), { responseType: 'blob' })
        .then((r) => {
          const url = URL.createObjectURL(r.data);
          setPdfUrl(url);
          revokePdf = () => URL.revokeObjectURL(url);
        })
        .catch(() => setPdfUrl(null));
    }

    return () => {
      revokeVerify?.();
      revokePdf?.();
    };
  }, [data]);

  if (!userId) return null;

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-3 sm:p-6 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-3xl max-h-[92dvh] rounded-3xl bg-white shadow-2xl flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-200">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide text-tinder">Admin · user details</p>
            <p className="font-bold text-base truncate">
              {data ? `${data.displayName || data.username} · @${data.username}` : 'Loading…'}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 grid place-items-center rounded-full text-neutral-500 hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-sm flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Identity */}
          {data && (
            <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Email">{data.email}</Field>
              <Field label="Username">@{data.username}</Field>
              <Field label="Role">
                <RoleChip role={data.role} />
                {data.banned && (
                  <span className="ml-2 inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-rose-100 text-rose-600">
                    BANNED
                  </span>
                )}
              </Field>
              <Field label="Created">{fmt(data.createdAt)}</Field>
              <Field label="Date of birth">{fmt(data.dateOfBirth)}</Field>
              <Field label="Last seen">{fmt(data.lastSeenAt) || '—'}</Field>
            </section>
          )}

          {/* Verification photo */}
          <section>
            <h3 className="text-sm font-bold flex items-center gap-1.5 mb-2">
              <Camera size={14} className="text-tinder" />
              Live verification selfie
              {data?.verifiedAt && (
                <span className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-700">
                  <ShieldCheck size={10} /> Verified · {fmt(data.verifiedAt)}
                </span>
              )}
            </h3>
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 overflow-hidden grid place-items-center min-h-[220px]">
              {!data?.hasVerificationPhoto ? (
                <p className="text-sm text-neutral-500 py-12 px-6 text-center">
                  This user did not provide a live verification photo
                  (likely a legacy account predating live verification).
                </p>
              ) : !verifyUrl ? (
                <p className="text-sm text-neutral-400 py-12">Loading photo…</p>
              ) : (
                <img
                  src={verifyUrl}
                  alt="Live verification selfie"
                  className="max-h-[420px] w-auto object-contain"
                />
              )}
            </div>
          </section>

          {/* Consent record */}
          <section>
            <h3 className="text-sm font-bold flex items-center gap-1.5 mb-2">
              <FileText size={14} className="text-tinder" />
              Consent &amp; community guidelines
            </h3>
            {!data?.consent || (!data.consent.acceptedAt && !data.consent.fullName) ? (
              <p className="text-sm text-neutral-500 py-3 px-3 rounded-2xl border border-neutral-200 bg-white">
                No consent record on this account (predates the consent flow).
              </p>
            ) : (
              <div className="rounded-2xl border border-neutral-200 overflow-hidden">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-neutral-50 text-[13px]">
                  <Field small label="Full name on file">{data.consent.fullName || '—'}</Field>
                  <Field small label="Signature">
                    <span className="italic" style={{ fontFamily: 'cursive' }}>
                      {data.consent.signature || '—'}
                    </span>
                  </Field>
                  <Field small label="Accepted at">{fmt(data.consent.acceptedAt)}</Field>
                  <Field small label="Document version">{data.consent.version || '—'}</Field>
                  <Field small label="Recorded IP">
                    <span className="font-mono">{data.consent.ip || '—'}</span>
                  </Field>
                  <Field small label="PDF size">
                    {data.consent.pdfBytes ? `${(data.consent.pdfBytes / 1024).toFixed(1)} KB` : '—'}
                  </Field>
                </div>

                {/* Consent agreement rendered fully on the client.
                    The backend PDF stays the canonical archived
                    record (download link below); this view is what
                    the admin actually reads in-page. */}
                <div className="border-t border-neutral-200">
                  <ConsentDocument
                    user={{
                      _id: data._id || data.id,
                      username: data.username,
                      email: data.email,
                    }}
                    consent={data.consent}
                  />
                  {data.consent.hasPdf && (
                    <div className="px-4 py-2.5 border-t border-neutral-200 flex items-center justify-end">
                      {pdfUrl ? (
                        <a
                          href={pdfUrl}
                          download={`consent-${data.username}.pdf`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full bg-ink text-white hover:bg-neutral-800 transition"
                        >
                          <Download size={12} /> Download archived PDF
                        </a>
                      ) : (
                        <span className="text-[11px] text-neutral-400">
                          Preparing PDF download…
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, small }) {
  return (
    <div>
      <p className={`font-bold uppercase tracking-wide text-neutral-500 ${small ? 'text-[10px]' : 'text-[11px]'}`}>
        {label}
      </p>
      <p className={`mt-0.5 ${small ? 'text-sm' : 'text-sm'} text-ink`}>{children || '—'}</p>
    </div>
  );
}

function RoleChip({ role }) {
  const styles = {
    admin: 'bg-brand-100 text-brand-600',
    provider: 'bg-amber-100 text-amber-700',
    user: 'bg-neutral-100 text-neutral-600',
  }[role || 'user'];
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wide ${styles}`}>
      {role || 'user'}
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
