import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar } from 'lucide-react';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function daysInMonth(year, monthZeroIndexed) {
  if (!year || monthZeroIndexed === '') return 31;
  return new Date(Number(year), Number(monthZeroIndexed) + 1, 0).getDate();
}

const pad = (n) => String(n).padStart(2, '0');

// Parse 'YYYY-MM-DD' -> { y, m, d } where m is zero-indexed string
function parseIso(iso) {
  const [y = '', mm = '', d = ''] = (iso || '').split('-');
  const m = mm ? String(parseInt(mm, 10) - 1) : '';
  return { y, m, d };
}

export default function DateOfBirthInput({ value, onChange, required, minAge = 18 }) {
  const initial = useRef(parseIso(value));
  const [year, setYear] = useState(initial.current.y);
  const [month, setMonth] = useState(initial.current.m);
  const [day, setDay] = useState(initial.current.d);

  // If parent resets value to '', clear locally too.
  useEffect(() => {
    if (!value) {
      setYear((y) => (y ? '' : y));
      setMonth((m) => (m !== '' ? '' : m));
      setDay((d) => (d ? '' : d));
    }
  }, [value]);

  // When all three are present, emit ISO. Otherwise emit '' so the form treats it as missing.
  useEffect(() => {
    if (year && month !== '' && day) {
      const max = daysInMonth(year, month);
      const safeDay = Math.min(parseInt(day, 10), max);
      const iso = `${year}-${pad(parseInt(month, 10) + 1)}-${pad(safeDay)}`;
      if (iso !== value) onChange(iso);
    } else if (value) {
      onChange('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, day]);

  const currentYear = new Date().getFullYear();
  const maxYear = currentYear - minAge;
  const minYear = 1900;

  const years = useMemo(() => {
    const arr = [];
    for (let y = maxYear; y >= minYear; y--) arr.push(y);
    return arr;
  }, [maxYear]);

  const dayCount = daysInMonth(year, month);
  const days = useMemo(() => Array.from({ length: dayCount }, (_, i) => i + 1), [dayCount]);

  // If month/year change makes current day invalid, snap it down.
  useEffect(() => {
    if (day && parseInt(day, 10) > dayCount) setDay(pad(dayCount));
  }, [dayCount]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
      <span className="w-9 h-9 rounded-full bg-neutral-100 grid place-items-center text-neutral-400 shrink-0">
        <Calendar size={16} strokeWidth={1.8} />
      </span>

      <SelectField label="Month" value={month} onChange={(e) => setMonth(e.target.value)} required={required}>
        <option value="">Month</option>
        {MONTHS.map((m, i) => (
          <option key={i} value={String(i)}>
            {m}
          </option>
        ))}
      </SelectField>

      <SelectField label="Day" value={day} onChange={(e) => setDay(e.target.value)} required={required}>
        <option value="">Day</option>
        {days.map((d) => (
          <option key={d} value={pad(d)}>
            {d}
          </option>
        ))}
      </SelectField>

      <SelectField label="Year" value={year} onChange={(e) => setYear(e.target.value)} required={required}>
        <option value="">Year</option>
        {years.map((y) => (
          <option key={y} value={String(y)}>
            {y}
          </option>
        ))}
      </SelectField>
    </div>
  );
}

function SelectField({ label, value, onChange, required, children }) {
  return (
    <div className="relative">
      <select
        aria-label={label}
        required={required}
        value={value}
        onChange={onChange}
        className="w-full appearance-none px-3 py-2.5 pr-9 text-sm rounded-full border border-neutral-300 bg-white text-ink focus:outline-none focus:border-ink focus:ring-4 focus:ring-black/5 transition"
      >
        {children}
      </select>
      <svg
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </div>
  );
}
