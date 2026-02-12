import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { Check, Monitor, Users, Clock, CreditCard, BarChart3, Settings, Bell } from 'lucide-react';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { RecentSessions } from './components/RecentSessions';

export const metadata: Metadata = {
  title: 'Dashboard - SquadX Live',
  description: 'SquadX Live Dashboard - Manage your sessions, billing, and settings.',
};

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('dashboard');
  const tSettings = await getTranslations('settings');

  const stats = [
    { label: t('sessionsThisMonth'), value: '0', icon: Monitor },
    { label: t('totalParticipants'), value: '0', icon: Users },
    { label: t('hoursUsed'), value: '0h', icon: Clock },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <Header />

      <main className="flex-1 py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Welcome Banner */}
          <div className="from-primary-600 to-primary-700 mb-8 rounded-xl bg-gradient-to-r p-6 text-white shadow-lg">
            <h1 className="text-3xl font-bold">{t('welcome')}</h1>
            <p className="text-primary-100 mt-2">
              {t('welcomeSubtitle')}
            </p>
            <div className="mt-4 flex gap-4">
              <Link
                href="/host"
                className="text-primary-600 hover:bg-primary-50 rounded-lg bg-white px-6 py-2 font-semibold transition-colors"
              >
                {t('startSharing')}
              </Link>
              <Link
                href="/join"
                className="border-primary-300 hover:bg-primary-500 rounded-lg border px-6 py-2 font-semibold text-white transition-colors"
              >
                {t('joinSession')}
              </Link>
            </div>
          </div>

          {/* Stats Preview (Greyed Out) */}
          <div className="mb-8 grid gap-4 sm:grid-cols-3">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-gray-200 bg-white p-6 opacity-50 grayscale"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100">
                    <stat.icon className="h-6 w-6 text-gray-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">{stat.label}</p>
                    <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Main Content Grid */}
          <div className="grid gap-8 lg:grid-cols-3">
            {/* Left Column - Quick Actions */}
            <div className="space-y-6 lg:col-span-2">
              {/* Quick Actions */}
              <div className="rounded-xl border border-gray-200 bg-white p-6">
                <h2 className="text-lg font-semibold text-gray-900">{t('quickActions')}</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Link
                    href="/host"
                    className="hover:border-primary-300 hover:bg-primary-50 flex items-center gap-3 rounded-lg border border-gray-200 p-4 text-left transition-colors"
                  >
                    <Monitor className="text-primary-600 h-8 w-8" />
                    <div>
                      <p className="font-semibold text-gray-900">{t('startSession')}</p>
                      <p className="text-sm text-gray-500">{t('shareYourScreen')}</p>
                    </div>
                  </Link>
                  <Link
                    href="/join"
                    className="hover:border-accent-300 hover:bg-accent-50 flex items-center gap-3 rounded-lg border border-gray-200 p-4 text-left transition-colors"
                  >
                    <Users className="text-accent-600 h-8 w-8" />
                    <div>
                      <p className="font-semibold text-gray-900">{t('joinSession')}</p>
                      <p className="text-sm text-gray-500">{t('enterJoinCode')}</p>
                    </div>
                  </Link>
                </div>
              </div>

              {/* Recent Sessions */}
              <RecentSessions />

              {/* Usage Analytics (Greyed Out) */}
              <div className="rounded-xl border border-gray-200 bg-white p-6 opacity-50 grayscale">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">{t('usageAnalytics')}</h2>
                  <BarChart3 className="h-5 w-5 text-gray-400" />
                </div>
                <div className="mt-4 flex h-48 items-center justify-center rounded-lg bg-gray-50">
                  <p className="text-gray-400">{t('analyticsPlaceholder')}</p>
                </div>
              </div>
            </div>

            {/* Right Column - Plan & Settings */}
            <div className="space-y-6">
              {/* Current Plan */}
              <div className="rounded-xl border border-gray-200 bg-white p-6">
                <h2 className="text-lg font-semibold text-gray-900">{t('yourPlan')}</h2>
                <div className="border-primary-200 bg-primary-50 mt-4 rounded-lg border-2 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-primary-700 font-semibold">{t('freePlan')}</span>
                    <span className="bg-primary-100 text-primary-700 rounded-full px-2 py-0.5 text-xs font-medium">
                      {t('current')}
                    </span>
                  </div>
                  <p className="text-primary-600 mt-1 text-sm">{t('twoParticipantsP2P')}</p>
                </div>
              </div>

              {/* Upgrade Options (Greyed Out) */}
              <div className="rounded-xl border border-gray-200 bg-white p-6">
                <h2 className="text-lg font-semibold text-gray-900">{t('upgradePlan')}</h2>
                <p className="mt-1 text-sm text-gray-500">{t('comingSoon')}</p>
                <div className="mt-4 space-y-4">
                  <div className="rounded-lg border border-gray-200 p-4 opacity-50 grayscale">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-gray-900">Pro</p>
                        <p className="text-sm text-gray-500">For professionals & growing teams</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-900">$12</p>
                        <p className="text-xs text-gray-500">/month</p>
                      </div>
                    </div>
                    <ul className="mt-3 space-y-1">
                      <li className="flex items-center gap-2 text-sm text-gray-600">
                        <Check className="h-4 w-4 text-gray-400" />
                        10 participants + 50 viewers
                      </li>
                      <li className="flex items-center gap-2 text-sm text-gray-600">
                        <Check className="h-4 w-4 text-gray-400" />
                        100 viewer-hours included
                      </li>
                    </ul>
                    <button
                      disabled
                      className="mt-4 w-full cursor-not-allowed rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-400"
                    >
                      {t('comingSoon')}
                    </button>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-4 opacity-50 grayscale">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-gray-900">Team</p>
                        <p className="text-sm text-gray-500">For teams & organizations</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-900">$49</p>
                        <p className="text-xs text-gray-500">/month</p>
                      </div>
                    </div>
                    <ul className="mt-3 space-y-1">
                      <li className="flex items-center gap-2 text-sm text-gray-600">
                        <Check className="h-4 w-4 text-gray-400" />
                        Unlimited participants
                      </li>
                      <li className="flex items-center gap-2 text-sm text-gray-600">
                        <Check className="h-4 w-4 text-gray-400" />
                        500 viewer-hours included
                      </li>
                    </ul>
                    <button
                      disabled
                      className="mt-4 w-full cursor-not-allowed rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-400"
                    >
                      {t('comingSoon')}
                    </button>
                  </div>
                </div>
              </div>

              {/* Billing (Greyed Out) */}
              <div className="rounded-xl border border-gray-200 bg-white p-6 opacity-50 grayscale">
                <div className="flex items-center gap-3">
                  <CreditCard className="h-5 w-5 text-gray-400" />
                  <h2 className="text-lg font-semibold text-gray-900">{t('billing')}</h2>
                </div>
                <p className="mt-2 text-sm text-gray-500">{t('noPaymentMethod')}</p>
                <button
                  disabled
                  className="mt-4 w-full cursor-not-allowed rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-400"
                >
                  {t('addPaymentMethod')}
                </button>
              </div>

              {/* Settings Links */}
              <div className="rounded-xl border border-gray-200 bg-white p-6">
                <h2 className="text-lg font-semibold text-gray-900">{tSettings('title')}</h2>
                <div className="mt-4 space-y-2">
                  <Link
                    href="/settings"
                    className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-gray-50"
                  >
                    <Settings className="h-5 w-5 text-gray-400" />
                    <span className="text-gray-600">{t('accountSettings')}</span>
                  </Link>
                  <Link
                    href="/settings#notifications"
                    className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-gray-50"
                  >
                    <Bell className="h-5 w-5 text-gray-400" />
                    <span className="text-gray-600">{t('notifications')}</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
