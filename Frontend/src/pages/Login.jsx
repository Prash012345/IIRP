import { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';
import { ShieldAlert } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('admin@incident.io');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to login. Check credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="bg-surface max-w-md w-full rounded-lg shadow-md p-8">
        <div className="flex flex-col items-center mb-8">
          <ShieldAlert className="w-12 h-12 text-primary-600 mb-2" />
          <h1 className="text-2xl font-bold text-slate-800">IncidentOps</h1>
          <p className="text-sm text-slate-500">Sign in to your account</p>
        </div>

        {error && (
          <div className="bg-danger/10 text-danger text-sm p-3 rounded-md mb-4 border border-danger/20">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-600 text-white font-medium py-2 px-4 rounded-md hover:bg-primary-700 transition-colors disabled:opacity-70"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        
        <div className="mt-6 text-xs text-slate-500 text-center">
          <p>Test accounts: admin@incident.io | mike@incident.io</p>
          <p>Password: password123</p>
        </div>
      </div>
    </div>
  );
}