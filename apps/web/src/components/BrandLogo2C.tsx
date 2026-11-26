import { useId } from 'react';

interface BrandLogo2CProps {
  size?: number;
  className?: string;
}

export function BrandLogo2C({ size = 44, className = '' }: BrandLogo2CProps) {
  const uid = useId().replace(/:/g, '');
  const bgId = `logo2c-bg-${uid}`;
  const shineId = `logo2c-shine-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={className}
      style={{
        display: 'block',
        flexShrink: 0,
        borderRadius: `${Math.round(size * 0.31)}px`,
        boxShadow: 'var(--shadow-primary)',
      }}
    >
      <defs>
        <linearGradient id={bgId} x1="4" y1="4" x2="60" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" style={{ stopColor: 'var(--primary)' }} />
          <stop offset="55%" style={{ stopColor: 'var(--primary-2)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--sky)' }} />
        </linearGradient>
        <linearGradient id={shineId} x1="12" y1="4" x2="48" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" style={{ stopColor: 'var(--surface)', stopOpacity: 0.3 }} />
          <stop offset="100%" style={{ stopColor: 'var(--surface)', stopOpacity: 0 }} />
        </linearGradient>
      </defs>

      <rect width="64" height="64" rx="18" fill={`url(#${bgId})`} />
      <circle cx="52" cy="10" r="22" fill={`url(#${shineId})`} />

      {/* Geometric "2" */}
      <path
        d="M12.5 24.4C12.5 19.6 16.3 16.2 21.7 16.2C27.1 16.2 30.6 19.3 30.6 23.9C30.6 27.6 28.4 30.1 24 33.5L18.4 37.8H31.2V43.6H11.8V38.6L21.1 31.2C23.8 29 25 27.3 25 24.9C25 22.7 23.5 21.3 21.2 21.3C18.8 21.3 17.4 22.8 17.3 25.3L12.5 24.4Z"
        style={{ fill: 'var(--surface)' }}
      />

      {/* Geometric "С" */}
      <path
        d="M51.7 24.1C50.1 21.7 47.6 20.4 44.7 20.4C39.8 20.4 36.6 24.2 36.6 30C36.6 35.8 39.8 39.6 44.7 39.6C47.7 39.6 50.2 38.3 51.8 35.7L55.8 38.9C53.2 42.4 49.3 44.5 44.4 44.5C36.4 44.5 31 38.7 31 30C31 21.3 36.4 15.5 44.4 15.5C49.3 15.5 53.2 17.6 55.6 21L51.7 24.1Z"
        style={{ fill: 'var(--surface)' }}
      />

      {/* Subtle sleek underline */}
      <rect
        x="12.5"
        y="49"
        width="39"
        height="3.4"
        rx="1.7"
        style={{ fill: 'var(--surface)', fillOpacity: 0.45 }}
      />
    </svg>
  );
}
