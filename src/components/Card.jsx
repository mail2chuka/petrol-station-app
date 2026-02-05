'use client';

export default function Card({
  title,
  subtitle,
  children,
  className = '',
  action,
  icon: Icon,
  variant = 'default',
  noPadding = false,
  hover = true,
}) {
  const variants = {
    default: 'bg-white border border-slate-200/80',
    elevated: 'bg-white shadow-xl shadow-slate-200/50',
    outlined: 'bg-white border-2 border-slate-200',
    filled: 'bg-slate-50 border border-slate-200/50',
    gradient: 'bg-gradient-to-br from-white to-slate-50 border border-slate-200/80',
  };

  return (
    <div
      className={`
        rounded-2xl
        ${variants[variant]}
        ${hover ? 'transition-all duration-200 hover:shadow-lg hover:shadow-slate-200/50 hover:-translate-y-0.5' : ''}
        ${noPadding ? '' : 'p-6'}
        ${className}
      `}
    >
      {(title || action) && (
        <div className={`flex items-start justify-between gap-4 ${noPadding ? 'p-6 pb-0' : 'mb-4'}`}>
          <div className="flex items-center gap-3">
            {Icon && (
              <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-ecana-maroon/10 to-ecana-blue/10 rounded-xl flex items-center justify-center">
                <Icon className="w-5 h-5 text-ecana-maroon" />
              </div>
            )}
            <div>
              {title && (
                <h3 className="text-base font-semibold text-slate-900">{title}</h3>
              )}
              {subtitle && (
                <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
              )}
            </div>
          </div>
          {action && <div className="flex-shrink-0">{action}</div>}
        </div>
      )}
      <div className={noPadding && (title || action) ? 'p-6 pt-4' : ''}>
        {children}
      </div>
    </div>
  );
}

// Stat card for dashboards
export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendValue,
  color = 'maroon',
  className = '',
}) {
  const colors = {
    maroon: {
      bg: 'bg-gradient-to-br from-ecana-maroon/10 to-ecana-maroon/5',
      icon: 'bg-ecana-maroon text-white',
      text: 'text-ecana-maroon',
    },
    blue: {
      bg: 'bg-gradient-to-br from-ecana-blue/10 to-ecana-blue/5',
      icon: 'bg-ecana-blue text-white',
      text: 'text-ecana-blue',
    },
    emerald: {
      bg: 'bg-gradient-to-br from-emerald-500/10 to-emerald-500/5',
      icon: 'bg-emerald-500 text-white',
      text: 'text-emerald-600',
    },
    amber: {
      bg: 'bg-gradient-to-br from-amber-500/10 to-amber-500/5',
      icon: 'bg-amber-500 text-white',
      text: 'text-amber-600',
    },
    rose: {
      bg: 'bg-gradient-to-br from-rose-500/10 to-rose-500/5',
      icon: 'bg-rose-500 text-white',
      text: 'text-rose-600',
    },
  };

  const colorConfig = colors[color] || colors.maroon;

  return (
    <div
      className={`
        ${colorConfig.bg}
        rounded-2xl p-5
        border border-white/50
        transition-all duration-200
        hover:shadow-lg hover:-translate-y-0.5
        ${className}
      `}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-600 mb-1">{title}</p>
          <p className={`text-2xl font-bold ${colorConfig.text}`}>{value}</p>
          {subtitle && (
            <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
          )}
          {trend && (
            <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${trend === 'up' ? 'text-emerald-600' : 'text-red-500'}`}>
              {trend === 'up' ? (
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
              {trendValue}
            </div>
          )}
        </div>
        {Icon && (
          <div className={`w-12 h-12 ${colorConfig.icon} rounded-xl flex items-center justify-center shadow-lg`}>
            <Icon className="w-6 h-6" />
          </div>
        )}
      </div>
    </div>
  );
}

// Info card for displaying key-value pairs
export function InfoCard({ items, className = '' }) {
  return (
    <Card className={className}>
      <dl className="space-y-3">
        {items.map((item, index) => (
          <div key={index} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
            <dt className="text-sm text-slate-500">{item.label}</dt>
            <dd className="text-sm font-semibold text-slate-900">{item.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
