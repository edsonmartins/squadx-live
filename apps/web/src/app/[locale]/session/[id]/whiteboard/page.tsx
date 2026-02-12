'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { WhiteboardPanel } from '@/modules/whiteboard';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface SessionData {
  id: string;
  host_user_id: string;
  status: string;
  join_code: string;
}

interface ParticipantData {
  id: string;
  display_name: string;
  role: 'host' | 'viewer';
}

export default function WhiteboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<SessionData | null>(null);
  const [participant, setParticipant] = useState<ParticipantData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [boardId, setBoardId] = useState<string | undefined>(undefined);

  const router = useRouter();
  const searchParams = useSearchParams();

  // Get sessionId from params
  useEffect(() => {
    params.then(({ id }) => setSessionId(id));
  }, [params]);

  // Get boardId from search params
  useEffect(() => {
    const boardIdParam = searchParams.get('boardId');
    // Only set boardId if it's a valid value (not null, empty, or 'undefined' string)
    if (boardIdParam && boardIdParam !== 'undefined') {
      setBoardId(boardIdParam);
    }
  }, [searchParams]);

  // Fetch session and participant data
  useEffect(() => {
    if (!sessionId) return;

    async function fetchData() {
      setIsLoading(true);
      setError(null);

      try {
        // Get participant ID from URL
        const participantId = searchParams.get('p');

        // Fetch session data
        const sessionResponse = await fetch(`/api/sessions/${sessionId}`, {
          credentials: 'include',
        });
        if (!sessionResponse.ok) {
          throw new Error('Session not found');
        }
        const sessionResult = await sessionResponse.json() as { data?: SessionData; error?: string };
        if (!sessionResult.data) {
          throw new Error(sessionResult.error || 'Session not found');
        }
        const sessionData = sessionResult.data;
        setSession(sessionData);

        // If we have a participant ID, fetch participant data
        if (participantId) {
          // For now, use placeholder participant data
          // In a real implementation, this would be fetched from the API
          setParticipant({
            id: participantId,
            display_name: 'Participant',
            role: 'viewer',
          });
        } else {
          // Check if current user is authenticated
          const authResponse = await fetch('/api/auth/session', {
            credentials: 'include',
          });
          if (authResponse.ok) {
            const authResult = await authResponse.json() as { data?: { user?: { id: string; email?: string } } };
            const authData = authResult.data;
            if (authData?.user) {
              // Check if user is the host or just an authenticated user
              const isHost = authData.user.id === sessionData.host_user_id;
              setParticipant({
                id: authData.user.id,
                display_name: authData.user.email?.split('@')[0] || (isHost ? 'Host' : 'Participant'),
                role: isHost ? 'host' : 'viewer',
              });
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load session');
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [sessionId, searchParams]);

  const handleBoardChange = (newBoardId: string) => {
    // Ignore invalid board IDs
    if (!newBoardId || newBoardId === 'undefined') {
      console.warn('[Whiteboard] Ignoring invalid boardId:', newBoardId);
      return;
    }
    setBoardId(newBoardId);
    // Update URL without reloading the page
    const url = new URL(window.location.href);
    url.searchParams.set('boardId', newBoardId);
    router.replace(url.pathname + url.search);
  };

  if (isLoading || !sessionId) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Loading whiteboard...
          </span>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-gray-50 dark:bg-gray-900 p-8">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            {error || 'Session not found'}
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            The session may have ended or you may not have access.
          </p>
        </div>
        <Link
          href="/"
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>
      </div>
    );
  }

  if (!participant) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-gray-50 dark:bg-gray-900 p-8">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            Access Denied
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            You need to join the session to access the whiteboard.
          </p>
        </div>
        <Link
          href={`/join/${session.join_code}`}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Join Session
        </Link>
      </div>
    );
  }

  // Generate a consistent color for the participant
  const participantColor = `hsl(${(participant.id.charCodeAt(0) * 137) % 360}, 70%, 50%)`;

  return (
    <div className="flex h-screen flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="flex h-14 items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4">
        <div className="flex items-center gap-4">
          <Link
            href={participant.role === 'host' ? `/host/${sessionId}` : `/view/${sessionId}`}
            className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Session
          </Link>
          <span className="text-gray-300 dark:text-gray-600">/</span>
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            Whiteboard
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <div
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: participantColor }}
          />
          {participant.display_name}
        </div>
      </header>

      {/* Whiteboard */}
      <main className="flex-1 overflow-hidden">
        <WhiteboardPanel
          sessionId={sessionId}
          boardId={boardId}
          participantId={participant.id}
          participantName={participant.display_name}
          participantColor={participantColor}
          isHost={participant.role === 'host'}
          onBoardChange={handleBoardChange}
          className="h-full"
        />
      </main>
    </div>
  );
}
