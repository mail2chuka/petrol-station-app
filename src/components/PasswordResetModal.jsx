'use client';

import { useState } from 'react';
import Button from '@/components/Button';
import Input from '@/components/Input';

export default function PasswordResetModal({
  isOpen,
  targetName,
  onClose,
  onSubmit,
  isLoading = false,
}) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const resetLocalState = () => {
    setPassword('');
    setConfirmPassword('');
    setError('');
  };

  const handleClose = () => {
    resetLocalState();
    onClose?.();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    await onSubmit(password);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close reset password modal"
        onClick={handleClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-slate-900">Reset Password</h2>
          <p className="text-sm text-slate-500 mt-1">
            Set a new password for <span className="font-semibold">{targetName}</span>.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="New Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Input
            label="Confirm Password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />

          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

          <div className="flex gap-2 pt-2">
            <Button type="submit" isLoading={isLoading}>Reset Password</Button>
            <Button type="button" variant="secondary" onClick={handleClose}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
