import { useEffect, useState } from 'react';
import { Plus, Trash2, Save, Package as PackageIcon, Edit3, X } from 'lucide-react';
import { api } from '../services/api.js';

export default function PackagesManager() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // null | 'new' | id
  const [form, setForm] = useState({ title: '', description: '', price: 0, durationMinutes: '' });
  const [saving, setSaving] = useState(false);

  const load = () => {
    api
      .get('/packages/me')
      .then((r) => setItems(r.data.items || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const startNew = () => {
    setForm({ title: '', description: '', price: 50, durationMinutes: '15' });
    setEditing('new');
  };

  const startEdit = (pkg) => {
    setForm({
      title: pkg.title,
      description: pkg.description || '',
      price: pkg.price,
      durationMinutes: pkg.durationMinutes ?? '',
    });
    setEditing(pkg.id);
  };

  const cancel = () => {
    setEditing(null);
    setError(null);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        price: Number(form.price) || 0,
        durationMinutes:
          form.durationMinutes === '' ? null : Math.max(0, parseInt(form.durationMinutes, 10)),
      };
      if (editing === 'new') {
        await api.post('/packages', payload);
      } else {
        await api.patch(`/packages/${editing}`, payload);
      }
      setEditing(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!confirm('Delete this package?')) return;
    try {
      await api.delete(`/packages/${id}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <PackageIcon size={18} className="text-brand-500" /> My packages
        </h2>
        {!editing && (
          <button
            onClick={startNew}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full text-white bg-tinder shadow-tinder/30 hover:brightness-110 transition"
          >
            <Plus size={14} /> New package
          </button>
        )}
      </div>

      {error && (
        <div className="px-4 py-2.5 mb-3 bg-rose-50 border border-rose-100 text-rose-700 text-sm rounded-lg">
          {error}
        </div>
      )}

      {editing && (
        <form
          onSubmit={save}
          className="mb-4 rounded-2xl bg-white border border-neutral-200 p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <p className="font-semibold text-sm">
              {editing === 'new' ? 'New package' : 'Edit package'}
            </p>
            <button
              type="button"
              onClick={cancel}
              aria-label="Cancel"
              className="w-7 h-7 grid place-items-center rounded-lg hover:bg-neutral-100"
            >
              <X size={15} />
            </button>
          </div>

          <Field label="Title">
            <input
              required
              maxLength={80}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className={inputCls}
              placeholder="e.g. 30-minute coaching call"
            />
          </Field>

          <Field label="Description">
            <textarea
              rows={3}
              maxLength={500}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={`${inputCls} rounded-2xl resize-none`}
              placeholder="What's included?"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Price (credits)">
              <input
                type="number"
                min={0}
                required
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Duration (min)">
              <input
                type="number"
                min={0}
                value={form.durationMinutes}
                onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
                className={inputCls}
                placeholder="optional"
              />
            </Field>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-full text-white bg-tinder shadow-tinder/30 hover:brightness-110 transition disabled:opacity-50"
            >
              <Save size={14} /> {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={cancel}
              className="px-4 py-2 text-sm font-medium rounded-full border border-neutral-200 hover:bg-neutral-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : items.length === 0 && !editing ? (
        <p className="text-sm text-neutral-500 py-6 text-center bg-white rounded-2xl border border-dashed border-neutral-200">
          No packages yet. Create one to start earning.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((p) => (
            <li
              key={p.id}
              className="flex items-start gap-3 p-3 rounded-2xl bg-white border border-neutral-200"
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm">{p.title}</p>
                {p.description && (
                  <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2">{p.description}</p>
                )}
                <p className="text-xs text-neutral-400 mt-1">
                  <span className="font-bold text-emerald-600">{p.price} credits</span>
                  {p.durationMinutes ? ` · ${p.durationMinutes} min` : ''}
                  {!p.active ? ' · inactive' : ''}
                </p>
              </div>
              <button
                onClick={() => startEdit(p)}
                aria-label="Edit"
                className="w-8 h-8 grid place-items-center rounded-lg hover:bg-neutral-100 text-neutral-600"
              >
                <Edit3 size={15} />
              </button>
              <button
                onClick={() => remove(p.id)}
                aria-label="Delete"
                className="w-8 h-8 grid place-items-center rounded-lg hover:bg-rose-50 text-rose-600"
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-neutral-700">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  'w-full px-4 py-2.5 text-sm rounded-full bg-white border border-neutral-200 focus:outline-none focus:border-brand-300 focus:ring-4 focus:ring-brand-100 transition';
