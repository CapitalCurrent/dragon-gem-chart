import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      if (isSignUp) {
        await signUp(email, password);
        setMessage('Check your email for a confirmation link!');
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="text-center">
          <span className="text-6xl block animate-float">🐉</span>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-gold to-gold-light bg-clip-text text-transparent mt-4">
            Dragon Gems
          </h1>
          <p className="text-gray-400 text-sm mt-2">Behavior Chart & Reward Tracker</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="dragon-card space-y-4">
          <h2 className="text-center font-semibold text-gold">
            {isSignUp ? 'Create Account' : 'Sign In'}
          </h2>

          {error && (
            <div className="bg-gem-ruby/10 border border-gem-ruby/30 rounded-xl px-3 py-2 text-sm text-gem-ruby">
              {error}
            </div>
          )}

          {message && (
            <div className="bg-gem-emerald/10 border border-gem-emerald/30 rounded-xl px-3 py-2 text-sm text-gem-emerald">
              {message}
            </div>
          )}

          <div>
            <label className="text-xs text-gray-400 mb-1 block">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@email.com"
              required
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-gold w-full text-center disabled:opacity-50"
          >
            {loading ? '...' : isSignUp ? 'Create Account' : 'Sign In'}
          </button>

          <p className="text-center text-xs text-gray-500">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              type="button"
              onClick={() => { setIsSignUp(!isSignUp); setError(''); setMessage(''); }}
              className="text-gold hover:underline"
            >
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
