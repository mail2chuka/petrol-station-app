'use client';
import { useEffect } from 'react';

export default function NoScrollNumbers() {
  useEffect(() => {
    function blurOnWheel(e) {
      if (e.target.type === 'number') e.target.blur();
    }
    function blockArrows(e) {
      if (e.target.type === 'number' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
      }
    }
    document.addEventListener('wheel', blurOnWheel, { passive: true });
    document.addEventListener('keydown', blockArrows);
    return () => {
      document.removeEventListener('wheel', blurOnWheel);
      document.removeEventListener('keydown', blockArrows);
    };
  }, []);
  return null;
}
