'use client';

import { useTranslations } from 'next-intl';
import { Monitor, X } from 'lucide-react';
import type { PresentationRequest } from '@/hooks/useWebRTCHost';

interface PresentationRequestNotificationProps {
  requests: PresentationRequest[];
  onApprove: (viewerId: string) => void;
  onDeny: (viewerId: string) => void;
}

export function PresentationRequestNotification({
  requests,
  onApprove,
  onDeny,
}: PresentationRequestNotificationProps) {
  const t = useTranslations('session');

  if (requests.length === 0) return null;

  return (
    <div className="fixed bottom-20 right-4 z-50 space-y-2">
      {requests.map((request) => (
        <div
          key={request.id}
          className="animate-slide-in rounded-xl border border-gray-700 bg-gray-800 p-4 shadow-xl"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-600">
              <Monitor className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-white truncate">{request.name}</p>
              <p className="text-sm text-gray-400">{t('wantsToPresent')}</p>
            </div>
            <button
              type="button"
              onClick={() => onDeny(request.id)}
              className="flex-shrink-0 text-gray-500 hover:text-gray-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => onApprove(request.id)}
              className="flex-1 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
            >
              {t('approve')}
            </button>
            <button
              type="button"
              onClick={() => onDeny(request.id)}
              className="flex-1 rounded-lg bg-gray-700 px-3 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-600"
            >
              {t('deny')}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default PresentationRequestNotification;
