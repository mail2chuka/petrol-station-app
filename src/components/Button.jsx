'use client';

import { InlineSpinner } from './Loading';

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  type = 'button',
  disabled = false,
  isLoading = false,
  onClick,
  fullWidth = false,
  className = '',
  icon: Icon,
  iconPosition = 'left',
}) {
  const baseClasses = `
    inline-flex items-center justify-center gap-2
    font-semibold rounded-xl
    transition-all duration-200 ease-out
    focus:outline-none focus:ring-2 focus:ring-offset-2
    disabled:cursor-not-allowed disabled:opacity-60
    active:scale-[0.98]
  `;

  const variantClasses = {
    primary: `
      bg-gradient-to-br from-ecana-maroon to-ecana-maroon-800
      text-white
      shadow-lg shadow-ecana-maroon/25
      hover:shadow-xl hover:shadow-ecana-maroon/30
      hover:from-ecana-maroon-600 hover:to-ecana-maroon
      focus:ring-ecana-maroon/50
    `,
    secondary: `
      bg-white text-slate-700
      border border-slate-200
      shadow-sm
      hover:bg-slate-50 hover:border-slate-300
      focus:ring-slate-400/50
    `,
    danger: `
      bg-gradient-to-br from-red-500 to-red-600
      text-white
      shadow-lg shadow-red-500/25
      hover:shadow-xl hover:shadow-red-500/30
      hover:from-red-400 hover:to-red-500
      focus:ring-red-500/50
    `,
    success: `
      bg-gradient-to-br from-emerald-500 to-emerald-600
      text-white
      shadow-lg shadow-emerald-500/25
      hover:shadow-xl hover:shadow-emerald-500/30
      hover:from-emerald-400 hover:to-emerald-500
      focus:ring-emerald-500/50
    `,
    outline: `
      bg-transparent
      text-ecana-maroon
      border-2 border-ecana-maroon
      hover:bg-ecana-maroon hover:text-white
      focus:ring-ecana-maroon/50
    `,
    ghost: `
      bg-transparent text-slate-600
      hover:bg-slate-100 hover:text-slate-900
      focus:ring-slate-400/50
    `,
    link: `
      bg-transparent text-ecana-maroon
      hover:text-ecana-maroon-700 hover:underline
      focus:ring-0 p-0
    `,
  };

  const sizeClasses = {
    xs: 'px-2.5 py-1.5 text-xs',
    sm: 'px-3.5 py-2 text-sm',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-6 py-3 text-base',
    xl: 'px-8 py-4 text-lg',
  };

  const iconSizes = {
    xs: 'w-3.5 h-3.5',
    sm: 'w-4 h-4',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
    xl: 'w-6 h-6',
  };

  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      onClick={onClick}
      className={`
        ${baseClasses}
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
    >
      {isLoading ? (
        <>
          <InlineSpinner className={iconSizes[size]} />
          <span>{typeof children === 'string' ? 'Loading...' : children}</span>
        </>
      ) : (
        <>
          {Icon && iconPosition === 'left' && <Icon className={iconSizes[size]} />}
          {children}
          {Icon && iconPosition === 'right' && <Icon className={iconSizes[size]} />}
        </>
      )}
    </button>
  );
}

// Icon-only button variant
export function IconButton({
  icon: Icon,
  variant = 'ghost',
  size = 'md',
  className = '',
  ...props
}) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
  };

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  return (
    <Button
      variant={variant}
      className={`${sizeClasses[size]} !p-0 ${className}`}
      {...props}
    >
      <Icon className={iconSizes[size]} />
    </Button>
  );
}
