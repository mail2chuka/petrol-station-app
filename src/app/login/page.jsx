'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Button from '@/components/Button';
import Input from '@/components/Input';

export default function LoginPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    identifier: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const result = await signIn('credentials', {
        redirect: false,
        identifier: formData.identifier,
        password: formData.password,
      });

      if (result?.error) {
        setError(result.error || 'Invalid email or password');
        setLoading(false);
      } else {
        router.push('/');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 relative overflow-hidden">
        {/* Animated gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-ecana-maroon via-ecana-blue to-ecana-magenta">
          <div className="absolute inset-0 opacity-30">
            <div className="absolute top-0 -left-4 w-96 h-96 bg-white/20 rounded-full mix-blend-overlay filter blur-3xl animate-pulse" />
            <div className="absolute bottom-0 right-0 w-96 h-96 bg-white/20 rounded-full mix-blend-overlay filter blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-white/10 rounded-full mix-blend-overlay filter blur-3xl animate-pulse" style={{ animationDelay: '4s' }} />
          </div>
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-center px-12 xl:px-20">
          <div className="max-w-lg">
            {/* Logo */}
            <img
              src="/ECANA LOGO WHITE_1.png"
              alt="Ecana Energy"
              className="h-16 w-auto mb-8"
            />

            {/* Headline */}
            <h1 className="text-4xl xl:text-5xl font-bold text-white mb-6 leading-tight">
              Ecana Group
              <br />
              <span className="text-white/90">Online Portal</span>
            </h1>

            {/* Description */}
            <p className="text-lg text-white/70 mb-10 leading-relaxed">
              Your unified platform for managing all Ecana Group businesses — fuel stations, materials supply, and more.
            </p>

            {/* Features */}
            <div className="space-y-4">
              {[
                { icon: '⛽', text: 'Fuel station operations & sales' },
                { icon: '🏪', text: 'Materials & supplies management' },
                { icon: '📊', text: 'Real-time reports & analytics' },
                { icon: '👥', text: 'Multi-role access across all units' },
              ].map((feature, index) => (
                <div
                  key={index}
                  className="flex items-center gap-4 text-white/80"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <span className="text-2xl">{feature.icon}</span>
                  <span className="text-base">{feature.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Decorative elements */}
        <div className="absolute bottom-8 left-12 xl:left-20">
          <p className="text-sm text-white/40">
            &copy; {new Date().getFullYear()} Ecana Group. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right side - Login form */}
      <div className="w-full lg:w-1/2 xl:w-2/5 flex items-center justify-center p-6 sm:p-12 bg-gradient-to-br from-slate-50 to-white">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-10">
            <img
              src="/ECANA LOGO BLUE_1.png"
              alt="Ecana Energy"
              className="h-12 w-auto mx-auto mb-4"
            />
            <h2 className="text-xl font-semibold text-slate-900">Ecana Group Portal</h2>
          </div>

          {/* Welcome text */}
          <div className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">
              Welcome back
            </h1>
            <p className="text-slate-500">
              Sign in to your account to continue
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3">
              <div className="flex-shrink-0 w-5 h-5 rounded-full bg-red-100 flex items-center justify-center mt-0.5">
                <svg className="w-3 h-3 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-red-800">{error}</p>
                <p className="text-xs text-red-600 mt-0.5">Please check your email/login ID and password, then try again.</p>
              </div>
            </div>
          )}

          {/* Login form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="Email or Login ID"
              type="text"
              name="identifier"
              value={formData.identifier}
              onChange={handleChange}
              placeholder="e.g., admin01 or you@example.com"
              required
              autoComplete="username"
            />

            <Input
              label="Password"
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
            />

            <Button
              type="submit"
              isLoading={loading}
              fullWidth
              size="lg"
              className="mt-8"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          {/* Help text */}
          <div className="mt-8 pt-6 border-t border-slate-100">
            <p className="text-center text-sm text-slate-500">
              Having trouble signing in?{' '}
              <span className="text-ecana-maroon font-medium">Contact your administrator</span>
            </p>
          </div>

          {/* Mobile copyright */}
          <div className="lg:hidden mt-10 text-center">
            <p className="text-xs text-slate-400">
              &copy; {new Date().getFullYear()} Ecana Group. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
