'use client';

import { useState, useEffect } from 'react';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function toDateStr(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * DateCalendar
 *
 * Props:
 *   value         – selected date string 'YYYY-MM-DD'
 *   onChange      – (dateStr) => void
 *   markedDates   – { [YYYY-MM-DD]: { pending: number, total: number } }
 *   onMonthChange – (YYYY-MM string) => void  (fires when user navigates months)
 *   maxDate       – optional 'YYYY-MM-DD' string; days after this are disabled
 */
export default function DateCalendar({
  value,
  onChange,
  markedDates = {},
  onMonthChange,
  maxDate,
}) {
  const todayStr = new Date().toISOString().split('T')[0];

  const initialYear  = value ? Number(value.slice(0, 4)) : new Date().getFullYear();
  const initialMonth = value ? Number(value.slice(5, 7)) - 1 : new Date().getMonth();

  const [year,  setYear]  = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);

  // Keep view in sync if value jumps to a different month externally
  useEffect(() => {
    if (value) {
      const y = Number(value.slice(0, 4));
      const m = Number(value.slice(5, 7)) - 1;
      if (y !== year || m !== month) {
        setYear(y);
        setMonth(m);
      }
    }
  }, [value]);

  const navigate = (delta) => {
    let newMonth = month + delta;
    let newYear  = year;
    if (newMonth > 11) { newMonth = 0;  newYear += 1; }
    if (newMonth < 0)  { newMonth = 11; newYear -= 1; }
    setYear(newYear);
    setMonth(newMonth);
    const padded = `${newYear}-${String(newMonth + 1).padStart(2, '0')}`;
    onMonthChange?.(padded);
  };

  const goToday = () => {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth());
    onMonthChange?.(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    onChange(todayStr);
  };

  // Build 6-row × 7-col grid
  const firstWeekday  = new Date(year, month, 1).getDay();
  const daysInMonth   = new Date(year, month + 1, 0).getDate();
  const daysInPrev    = new Date(year, month, 0).getDate();

  const cells = [];
  for (let i = firstWeekday - 1; i >= 0; i--) {
    cells.push({ day: daysInPrev - i, outside: true, year: month === 0 ? year - 1 : year, month: month === 0 ? 11 : month - 1 });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, outside: false, year, month });
  }
  while (cells.length < 42) {
    const idx = cells.length - firstWeekday - daysInMonth + 1;
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear  = month === 11 ? year + 1 : year;
    cells.push({ day: idx, outside: true, year: nextYear, month: nextMonth });
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Month navigation */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <button
          onClick={() => navigate(-1)}
          className="w-8 h-8 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center text-gray-500 hover:text-gray-800"
          aria-label="Previous month"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <button
          onClick={goToday}
          className="text-sm font-semibold text-gray-800 hover:text-ecana-maroon transition-colors px-2 py-1 rounded-lg hover:bg-gray-50"
        >
          {MONTHS[month]} {year}
        </button>

        <button
          onClick={() => navigate(1)}
          className="w-8 h-8 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center text-gray-500 hover:text-gray-800"
          aria-label="Next month"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-gray-100">
        {WEEKDAYS.map(d => (
          <div key={d} className="py-2 text-center text-xs font-semibold text-gray-400 uppercase tracking-wide">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 p-2 gap-0.5">
        {cells.map((cell, idx) => {
          const dateStr = toDateStr(cell.year, cell.month, cell.day);
          const isSelected = !cell.outside && value === dateStr;
          const isToday    = !cell.outside && dateStr === todayStr;
          const isAfterMax = maxDate && dateStr > maxDate;
          const mark = !cell.outside ? markedDates[dateStr] : null;
          const hasPending = (mark?.pending ?? 0) > 0;
          const hasAny     = (mark?.total ?? 0) > 0;
          const disabled   = cell.outside || isAfterMax;

          return (
            <button
              key={idx}
              disabled={disabled}
              onClick={() => !disabled && onChange(dateStr)}
              className={[
                'relative flex flex-col items-center justify-center h-9 w-full rounded-lg text-sm transition-all',
                disabled
                  ? 'text-gray-200 cursor-default'
                  : 'cursor-pointer',
                isSelected
                  ? 'bg-ecana-maroon text-white font-bold shadow-sm'
                  : !disabled
                    ? 'hover:bg-gray-100 text-gray-800'
                    : '',
                isToday && !isSelected
                  ? 'ring-2 ring-ecana-maroon font-bold'
                  : '',
                // highlight days with pending records (not selected)
                !isSelected && hasPending && !disabled
                  ? 'bg-amber-50'
                  : '',
              ].filter(Boolean).join(' ')}
            >
              <span className="leading-none">{cell.day}</span>

              {/* Status dot */}
              {!cell.outside && hasAny && (
                <span
                  className={[
                    'absolute bottom-1 w-1.5 h-1.5 rounded-full',
                    isSelected
                      ? 'bg-white/70'
                      : hasPending
                        ? 'bg-amber-500'
                        : 'bg-green-500',
                  ].join(' ')}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 px-4 py-2.5 border-t border-gray-100 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-500 inline-block shrink-0" />
          Has pending
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block shrink-0" />
          All reviewed
        </span>
        <span className="flex items-center gap-1.5 ml-auto">
          <span className="w-4 h-4 rounded ring-2 ring-ecana-maroon inline-flex items-center justify-center text-[10px] font-bold text-ecana-maroon shrink-0">•</span>
          Today
        </span>
      </div>
    </div>
  );
}
