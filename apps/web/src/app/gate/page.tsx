'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { Lock, Loader2, AlertCircle } from 'lucide-react';

export default function GatePage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/gate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await response.json() as { success?: boolean; error?: string };

      if (data.success) {
        router.push('/');
        router.refresh();
      } else {
        setError(data.error || 'Senha incorreta');
      }
    } catch {
      setError('Erro ao verificar senha');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center">
          <Logo size="lg" variant="light" />
          <p className="mt-4 text-gray-400">Beta Access</p>
        </div>

        <div className="rounded-2xl border border-gray-700 bg-gray-800/50 p-8 backdrop-blur">
          <div className="mb-6 flex justify-center">
            <div className="rounded-full bg-primary-600/20 p-4">
              <Lock className="h-8 w-8 text-primary-400" />
            </div>
          </div>

          <h1 className="mb-2 text-center text-xl font-semibold text-white">
            Acesso Restrito
          </h1>
          <p className="mb-6 text-center text-sm text-gray-400">
            Digite a senha para acessar o SquadX Live
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Senha de acesso"
                className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-3 text-white placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                autoFocus
                disabled={loading}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-900/30 px-4 py-3 text-sm text-red-400">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full rounded-lg bg-primary-600 py-3 font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verificando...
                </span>
              ) : (
                'Entrar'
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-gray-500">
          Esta é uma versão beta em desenvolvimento.
        </p>
      </div>
    </div>
  );
}
