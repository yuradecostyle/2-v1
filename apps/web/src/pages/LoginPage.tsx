import { useState } from 'react';
import {
  Lock,
  User,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import {
  apiFetch,
  setActiveUserContext,
  setAuthToken,
  type AuthUserDto,
} from '../lib/api';
import { BrandLogo2C } from '../components/BrandLogo2C';

interface Props {
  onSuccess: (user: AuthUserDto) => void;
}

const STARTER_DEMO_ACCOUNTS = [
  { label: 'Власник', login: 'admin', pass: 'admin123' },
  { label: 'Продажі', login: 'sales', pass: 'sales123' },
  { label: 'Закупівлі', login: 'zakup', pass: 'zakup123' },
  { label: 'Бухгалтер', login: 'buh', pass: 'buh123' },
  { label: 'Комірник', login: 'sklad', pass: 'sklad123' },
];

export function LoginPage({ onSuccess }: Props) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!login.trim() || !password) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ token: string; user: AuthUserDto }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ login: login.trim(), password }),
      });
      setAuthToken(res.token);
      setActiveUserContext(res.user.role, res.user.fullName);
      onSuccess(res.user);
    } catch (err) {
      setError((err as Error).message || 'Невірний логін або пароль');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div
        className="popin w-full max-w-[440px] space-y-6 p-7 sm:p-8"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-xl)',
          boxShadow: 'var(--shadow-modal)',
        }}
      >
        {/* Brand */}
        <div className="flex items-center gap-3.5">
          <BrandLogo2C size={48} />
          <div>
            <h1
              className="font-display text-[24px] font-extrabold leading-tight"
              style={{ color: 'var(--text)', letterSpacing: '-0.03em' }}
            >
              2С
            </h1>
            <p className="text-[13px] font-medium" style={{ color: 'var(--muted)' }}>
              Вхід за особистим логіном та паролем
            </p>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 p-3.5 text-[13px] font-semibold"
            style={{
              background: 'var(--neg-soft)',
              color: 'var(--neg-ink)',
              borderRadius: 'var(--r-md)',
            }}
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="login-username"
              className="mb-1.5 block text-[13px] font-bold"
              style={{ color: 'var(--text-2)' }}
            >
              Логін або Email
            </label>
            <div
              className="flex min-h-[46px] items-center gap-2.5 px-3.5"
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--r-sm)',
              }}
            >
              <User className="h-4 w-4 shrink-0" style={{ color: 'var(--muted)' }} aria-hidden="true" />
              <input
                id="login-username"
                type="text"
                autoComplete="username"
                required
                autoFocus
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="Напр. admin"
                className="w-full bg-transparent text-[15px] font-medium focus:outline-none"
                style={{ color: 'var(--text)' }}
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="mb-1.5 block text-[13px] font-bold"
              style={{ color: 'var(--text-2)' }}
            >
              Пароль
            </label>
            <div
              className="flex min-h-[46px] items-center gap-2.5 px-3.5"
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--r-sm)',
              }}
            >
              <Lock className="h-4 w-4 shrink-0" style={{ color: 'var(--muted)' }} aria-hidden="true" />
              <input
                id="login-password"
                type={showPass ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Введіть пароль"
                className="w-full bg-transparent text-[15px] font-medium focus:outline-none"
                style={{ color: 'var(--text)' }}
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                aria-label={showPass ? 'Сховати пароль' : 'Показати пароль'}
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{ color: 'var(--muted)' }}
              >
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 text-[15px] font-extrabold transition disabled:opacity-60"
            style={{
              borderRadius: 'var(--r-sm)',
              background: 'linear-gradient(135deg, var(--primary), var(--primary-2))',
              color: 'var(--surface)',
              boxShadow: 'var(--shadow-primary)',
            }}
          >
            <span>{loading ? 'Перевірка доступу...' : 'Увійти в систему'}</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </form>

        {/* Quick starter credentials helper */}
        <div
          className="space-y-2.5 p-4"
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-md)',
          }}
        >
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
            <ShieldCheck className="h-3.5 w-3.5" style={{ color: 'var(--pos)' }} aria-hidden="true" />
            Стартові доступи (натисніть для підстановки)
          </div>
          <div className="grid grid-cols-2 gap-2">
            {STARTER_DEMO_ACCOUNTS.map((acc) => (
              <button
                key={acc.login}
                type="button"
                onClick={() => {
                  setLogin(acc.login);
                  setPassword(acc.pass);
                }}
                className="flex flex-col items-start px-3 py-2 text-left transition"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-sm)',
                }}
              >
                <span className="text-[12px] font-bold" style={{ color: 'var(--text)' }}>
                  {acc.label}
                </span>
                <span className="font-mono text-[11px]" style={{ color: 'var(--muted)' }}>
                  {acc.login} / {acc.pass}
                </span>
              </button>
            ))}
          </div>
          <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
            Після входу під <strong>admin</strong> ви зможете змінити свій пароль і створити
            особисті логіни/паролі для кожного працівника.
          </p>
        </div>
      </div>
    </div>
  );
}
