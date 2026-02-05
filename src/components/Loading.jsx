'use client';

export default function Loading({ size = 'default', text = '', fullScreen = false, overlay = false }) {
  const sizeClasses = {
    small: 'w-5 h-5 border-2',
    default: 'w-10 h-10 border-3',
    large: 'w-14 h-14 border-4',
  };

  const containerClasses = fullScreen
    ? 'fixed inset-0 z-50'
    : 'flex justify-center items-center min-h-[200px] w-full';

  const overlayClasses = overlay
    ? 'bg-white/80 backdrop-blur-sm'
    : '';

  return (
    <div className={`${containerClasses} ${overlayClasses}`}>
      <div className="flex flex-col items-center justify-center gap-4">
        {/* Modern spinner with gradient */}
        <div className="relative">
          {/* Outer glow ring */}
          <div
            className={`absolute inset-0 rounded-full bg-gradient-to-r from-ecana-maroon via-ecana-blue to-ecana-magenta opacity-20 blur-md animate-pulse`}
            style={{ transform: 'scale(1.5)' }}
          />

          {/* Main spinner */}
          <div
            className={`
              ${sizeClasses[size]}
              rounded-full
              border-slate-200
              border-t-ecana-maroon
              border-r-ecana-blue
              animate-spin
              relative
            `}
            style={{
              animationDuration: '0.8s',
              animationTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />

          {/* Inner dot */}
          <div
            className="absolute inset-0 flex items-center justify-center"
          >
            <div
              className="w-2 h-2 bg-gradient-to-br from-ecana-maroon to-ecana-blue rounded-full animate-pulse"
              style={{ animationDuration: '1s' }}
            />
          </div>
        </div>

        {/* Loading text */}
        {text && (
          <p className="text-sm font-medium text-slate-600 animate-pulse">
            {text}
          </p>
        )}
      </div>
    </div>
  );
}

// Inline spinner for buttons and small spaces
export function InlineSpinner({ className = '' }) {
  return (
    <svg
      className={`w-4 h-4 animate-spin ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

// Skeleton loader for content placeholders
export function Skeleton({ className = '', variant = 'text' }) {
  const variants = {
    text: 'h-4 rounded',
    title: 'h-6 rounded w-3/4',
    avatar: 'h-12 w-12 rounded-full',
    card: 'h-32 rounded-xl',
    button: 'h-10 w-24 rounded-lg',
  };

  return (
    <div
      className={`bg-slate-200 animate-pulse ${variants[variant]} ${className}`}
    />
  );
}

// Page loading wrapper with branded design
export function PageLoader() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <div className="flex flex-col items-center gap-6">
        {/* Logo */}
        <img
          src="/ECANA LOGO BLUE_1-64.png"
          alt="Ecana Energy"
          className="h-12 w-auto animate-pulse"
        />

        {/* Spinner */}
        <div className="relative">
          <div className="w-12 h-12 rounded-full border-3 border-slate-200 border-t-ecana-maroon animate-spin" />
        </div>

        {/* Text */}
        <p className="text-sm text-slate-500 font-medium">Loading...</p>
      </div>
    </div>
  );
}
