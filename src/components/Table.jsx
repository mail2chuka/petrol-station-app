'use client';

export default function Table({ columns, data, onRowClick, emptyMessage = 'No data available' }) {
  if (!data || data.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-4 bg-slate-100 rounded-2xl flex items-center justify-center">
          <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        </div>
        <p className="text-slate-500 font-medium">{emptyMessage}</p>
        <p className="text-sm text-slate-400 mt-1">Data will appear here when available</p>
      </div>
    );
  }

  return (
    <div>
      {/* Mobile cards */}
      <div className="space-y-3 sm:hidden">
        {data.map((row, rowIndex) => (
          <div
            key={rowIndex}
            onClick={() => onRowClick && onRowClick(row)}
            className={`
              rounded-2xl border border-slate-200/80 bg-white p-4
              transition-all duration-200
              ${onRowClick
                ? 'cursor-pointer active:scale-[0.98] hover:shadow-md hover:border-slate-300'
                : ''
              }
            `}
          >
            {/* Primary content */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-900 truncate">
                  {columns[0]?.render ? columns[0].render(row) : row[columns[0]?.field]}
                </div>
                {columns[1] && (
                  <div className="text-xs text-slate-500 truncate mt-0.5">
                    {columns[1]?.render ? columns[1].render(row) : row[columns[1]?.field]}
                  </div>
                )}
              </div>
              {columns[columns.length - 1] && columns.length > 2 && (
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold text-ecana-maroon">
                    {columns[columns.length - 1]?.render
                      ? columns[columns.length - 1].render(row)
                      : row[columns[columns.length - 1]?.field]}
                  </div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide">
                    {columns[columns.length - 1]?.header}
                  </div>
                </div>
              )}
            </div>

            {/* Additional fields */}
            {columns.length > 3 && (
              <dl className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2">
                {columns.slice(2, Math.min(columns.length - 1, 6)).map((column, colIndex) => (
                  <div key={colIndex} className="rounded-xl bg-slate-50 px-3 py-2">
                    <dt className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
                      {column.header}
                    </dt>
                    <dd className="mt-0.5 text-sm font-medium text-slate-900 truncate">
                      {column.render ? column.render(row) : row[column.field]}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-hidden rounded-xl border border-slate-200/80">
        <table className="min-w-full">
          <thead>
            <tr className="bg-slate-50/80">
              {columns.map((column, index) => (
                <th
                  key={index}
                  className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider"
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {data.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                onClick={() => onRowClick && onRowClick(row)}
                className={`
                  transition-colors
                  ${onRowClick
                    ? 'hover:bg-slate-50 cursor-pointer'
                    : ''
                  }
                `}
              >
                {columns.map((column, colIndex) => (
                  <td
                    key={colIndex}
                    className="px-5 py-4 text-sm text-slate-700"
                  >
                    {column.render ? column.render(row) : row[column.field]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Badge component for table cells
export function TableBadge({ children, variant = 'default' }) {
  const variants = {
    default: 'bg-slate-100 text-slate-700',
    success: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-red-100 text-red-700',
    info: 'bg-blue-100 text-blue-700',
    primary: 'bg-ecana-maroon/10 text-ecana-maroon',
  };

  return (
    <span className={`
      inline-flex items-center px-2.5 py-0.5
      text-xs font-semibold rounded-full
      ${variants[variant]}
    `}>
      {children}
    </span>
  );
}

// Action button for table cells
export function TableAction({ onClick, variant = 'default', children }) {
  const variants = {
    default: 'text-slate-600 hover:text-slate-900 hover:bg-slate-100',
    primary: 'text-ecana-maroon hover:text-ecana-maroon-800 hover:bg-ecana-maroon/10',
    danger: 'text-red-600 hover:text-red-700 hover:bg-red-50',
    success: 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50',
  };

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      className={`
        px-3 py-1.5 rounded-lg text-xs font-semibold
        transition-colors duration-200
        ${variants[variant]}
      `}
    >
      {children}
    </button>
  );
}
