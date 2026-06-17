'use client';
import { useEffect } from 'react';

export default function NoScrollNumbers() {
  useEffect(() => {
    function blurOnWheel(e) {
      if (e.target.type === 'number') e.target.blur();
    }
    document.addEventListener('wheel', blurOnWheel, { passive: true });
    return () => document.removeEventListener('wheel', blurOnWheel);
  }, []);
  return null;
}
