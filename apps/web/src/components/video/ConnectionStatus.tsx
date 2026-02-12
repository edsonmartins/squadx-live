'use client';

import { useTranslations } from 'next-intl';
import { Monitor, Loader2, AlertCircle, WifiOff, RefreshCw } from 'lucide-react';
import type { ConnectionState } from '@squadx/shared-types';

interface ConnectionStatusProps {
  connectionState: ConnectionState;
  error: string | null;
  onReconnect?: (() => void) | undefined;
}

export function ConnectionStatus({ connectionState, error, onReconnect }: ConnectionStatusProps) {
  const t = useTranslations('video');

  // Only show overlay for non-connected states
  if (connectionState === 'connected') {
    return null;
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/80">
      <div className="text-center">
        {connectionState === 'idle' && <IdleState t={t} />}

        {connectionState === 'connecting' && <ConnectingState t={t} />}

        {connectionState === 'reconnecting' && <ReconnectingState t={t} error={error} />}

        {connectionState === 'failed' && <FailedState t={t} error={error} onReconnect={onReconnect} />}

        {connectionState === 'disconnected' && <DisconnectedState t={t} onReconnect={onReconnect} />}
      </div>
    </div>
  );
}

interface StateProps {
  t: ReturnType<typeof useTranslations<'video'>>;
}

function IdleState({ t }: StateProps) {
  return (
    <>
      <div className="rounded-full bg-gray-800 p-6">
        <Monitor className="h-16 w-16 text-gray-600" />
      </div>
      <h2 className="mt-6 text-xl font-semibold text-white">{t('waitingForShare')}</h2>
      <p className="mt-2 max-w-md text-sm text-gray-400">
        {t('hostNotSharing')}
      </p>
    </>
  );
}

function ConnectingState({ t }: StateProps) {
  return (
    <>
      <div className="rounded-full bg-gray-800 p-6">
        <Loader2 className="h-16 w-16 animate-spin text-blue-400" />
      </div>
      <h2 className="mt-6 text-xl font-semibold text-white">{t('connecting')}...</h2>
      <p className="mt-2 max-w-md text-sm text-gray-400">
        {t('connectingMessage')}
      </p>
    </>
  );
}

function ReconnectingState({ t, error }: StateProps & { error: string | null }) {
  return (
    <>
      <div className="rounded-full bg-yellow-900/50 p-6">
        <RefreshCw className="h-16 w-16 animate-spin text-yellow-400" />
      </div>
      <h2 className="mt-6 text-xl font-semibold text-white">{t('reconnecting')}...</h2>
      <p className="mt-2 max-w-md text-sm text-gray-400">
        {error ?? t('reconnectingMessage')}
      </p>
    </>
  );
}

function FailedState({
  t,
  error,
  onReconnect,
}: StateProps & {
  error: string | null;
  onReconnect?: (() => void) | undefined;
}) {
  return (
    <>
      <div className="rounded-full bg-red-900/50 p-6">
        <AlertCircle className="h-16 w-16 text-red-400" />
      </div>
      <h2 className="mt-6 text-xl font-semibold text-white">{t('connectionFailed')}</h2>
      <p className="mt-2 max-w-md text-sm text-gray-400">
        {error ?? t('connectionFailedMessage')}
      </p>
      {onReconnect && (
        <button
          type="button"
          onClick={onReconnect}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
        >
          <RefreshCw className="h-4 w-4" />
          {t('tryAgain')}
        </button>
      )}
    </>
  );
}

function DisconnectedState({ t, onReconnect }: StateProps & { onReconnect?: (() => void) | undefined }) {
  return (
    <>
      <div className="rounded-full bg-gray-800 p-6">
        <WifiOff className="h-16 w-16 text-gray-500" />
      </div>
      <h2 className="mt-6 text-xl font-semibold text-white">{t('hostDisconnected')}</h2>
      <p className="mt-2 max-w-md text-sm text-gray-400">
        {t('hostDisconnectedMessage')}
      </p>
      {onReconnect && (
        <button
          type="button"
          onClick={onReconnect}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-gray-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-600"
        >
          <RefreshCw className="h-4 w-4" />
          {t('reconnect')}
        </button>
      )}
    </>
  );
}
