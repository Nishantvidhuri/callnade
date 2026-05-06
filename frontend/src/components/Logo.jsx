export default function Logo({ size = 56 }) {
  return (
    <svg
      width={size}
      height={(size * 36) / 64}
      viewBox="0 0 64 36"
      fill="none"
      aria-label="callnade"
    >
      <path
        d="M16 18c0-6 4-10 9-10s7 3 7 7c0 4 2 7 7 7s9-4 9-10-4-10-9-10c-4 0-7 2-9 5l-2 3c-2 3-5 5-9 5-5 0-9-4-9-10"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M48 18c0 6-4 10-9 10s-7-3-7-7c0-4-2-7-7-7s-9 4-9 10 4 10 9 10c4 0 7-2 9-5l2-3c2-3 5-5 9-5 5 0 9 4 9 10"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
