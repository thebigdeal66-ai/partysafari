'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowser } from '@/lib/supabaseClient';
import { recordActivity } from '@/lib/activityFeed';

interface RSVPSectionProps {
  eventId: string;
  eventTitle: string;
}

type EventRsvpRow = {
  status: string | null;
  user_id: string | null;
};

export default function RSVPSection({
  eventId,
  eventTitle,
}: RSVPSectionProps) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [rsvpStatus, setRsvpStatus] = useState<'none' | 'going' | 'interested' | 'not_going'>('none');
  const [statusMessage, setStatusMessage] = useState('');
  const [messageVisible, setMessageVisible] = useState(false);
  const [goingCount, setGoingCount] = useState(0);
  const [interestedCount, setInterestedCount] = useState(0);
  const [notGoingCount, setNotGoingCount] = useState(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const refreshRsvps = useCallback(async () => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      console.error('Failed to resolve current user for RSVP:', userError);
    }

    const userId = user?.id ?? null;
    setCurrentUserId(userId);

    const { data: rsvpRows, error: rsvpError } = await supabase
      .from('event_rsvps')
      .select('status, user_id')
      .eq('event_id', eventId);

    if (rsvpError) {
      if (process.env.NODE_ENV === "development") {
        console.error('Failed to load RSVP counts:', rsvpError);
      }
      setGoingCount(0);
      setInterestedCount(0);
      setNotGoingCount(0);
      setRsvpStatus('none');
      return;
    }

    const rows: EventRsvpRow[] = (rsvpRows ?? []) as EventRsvpRow[];
    const nextGoingCount = rows.filter((row) => row.status === 'going').length;
    const nextInterestedCount = rows.filter((row) => row.status === 'interested').length;
    const nextNotGoingCount = rows.filter((row) => row.status === 'not_going').length;

    setGoingCount(nextGoingCount);
    setInterestedCount(nextInterestedCount);
    setNotGoingCount(nextNotGoingCount);

    if (userId) {
      const matchingRow = rows.find((row) => row.user_id === userId);
      setRsvpStatus(
        matchingRow?.status === 'going' || matchingRow?.status === 'interested' || matchingRow?.status === 'not_going'
          ? matchingRow.status
          : 'none'
      );
    } else {
      setRsvpStatus('none');
    }
  }, [eventId, supabase]);

  useEffect(() => {
    let isActive = true;
    const channel = supabase.channel(`event-rsvps-${eventId}`);

    const loadData = async () => {
      await refreshRsvps();
      if (!isActive) {
        return;
      }
    };

    void loadData();

    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'event_rsvps',
        filter: `event_id=eq.${eventId}`,
      },
      () => {
        if (isActive) {
          void refreshRsvps();
        }
      }
    );

    void channel.subscribe();

    return () => {
      isActive = false;
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [eventId, refreshRsvps, supabase]);

  const handleRSVP = async (status: 'going' | 'interested' | 'not_going') => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      if (process.env.NODE_ENV === "development") {
        console.error('Failed to resolve current user for RSVP:', userError);
      }
    }

    if (!user?.id) {
      router.push('/login');
      return;
    }

    setCurrentUserId(user.id);
    setIsSaving(true);

    const { error } = await supabase
      .from('event_rsvps')
      .upsert(
        {
          event_id: eventId,
          user_id: user.id,
          status,
        },
        { onConflict: 'event_id,user_id' }
      );

    if (!error) {
      await refreshRsvps();
      // Only record activity for going or interested status
      if (status === 'going' || status === 'interested') {
        await recordActivity({
          actorId: user.id,
          actionType: 'rsvp_event',
          eventId,
          metadata: { status, eventTitle },
        });
      }
      setStatusMessage(
        status === 'going'
          ? `You're going to ${eventTitle}! 🎉`
          : status === 'interested'
          ? `Added to interested in ${eventTitle} 👀`
          : `Marked as not going for ${eventTitle}.`
      );
      setMessageVisible(true);
      window.setTimeout(() => setMessageVisible(false), 3000);
    } else {
      setStatusMessage('Unable to save your RSVP right now.');
      setMessageVisible(true);
      window.setTimeout(() => setMessageVisible(false), 3000);
    }

    setIsSaving(false);
  };

  return (
    <section className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
      {messageVisible && (
        <div className="mb-4 rounded-2xl border border-violet-500/30 bg-violet-500/20 px-4 py-3 animate-fade-in">
          <p className="text-sm font-medium text-violet-200">{statusMessage}</p>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="mb-4 text-xl font-semibold text-white">Going Tonight?</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <button
            onClick={() => void handleRSVP('going')}
            disabled={isSaving}
            className={`rounded-full px-6 py-3 font-semibold transition-all duration-200 ${
              rsvpStatus === 'going'
                ? 'scale-105 bg-gradient-to-r from-violet-600 to-purple-600 text-white'
                : 'border border-violet-500/30 bg-violet-500/10 text-violet-200 hover:border-violet-500/50 hover:bg-violet-500/20'
            } ${isSaving ? 'cursor-not-allowed opacity-70' : ''}`}
          >
            {rsvpStatus === 'going' ? '✓ Going' : 'Going'}
          </button>
          <button
            onClick={() => void handleRSVP('interested')}
            disabled={isSaving}
            className={`rounded-full px-6 py-3 font-semibold transition-all duration-200 ${
              rsvpStatus === 'interested'
                ? 'scale-105 bg-gradient-to-r from-pink-600 to-rose-600 text-white'
                : 'border border-pink-500/30 bg-pink-500/10 text-pink-200 hover:border-pink-500/50 hover:bg-pink-500/20'
            } ${isSaving ? 'cursor-not-allowed opacity-70' : ''}`}
          >
            {rsvpStatus === 'interested' ? '✓ Interested' : 'Interested'}
          </button>
          <button
            onClick={() => void handleRSVP('not_going')}
            disabled={isSaving}
            className={`rounded-full px-6 py-3 font-semibold transition-all duration-200 ${
              rsvpStatus === 'not_going'
                ? 'scale-105 bg-gradient-to-r from-slate-600 to-zinc-600 text-white'
                : 'border border-slate-400/30 bg-slate-500/10 text-slate-200 hover:border-slate-300/50 hover:bg-slate-500/20'
            } ${isSaving ? 'cursor-not-allowed opacity-70' : ''}`}
          >
            {rsvpStatus === 'not_going' ? '✓ Not Going' : 'Not Going'}
          </button>
        </div>

        {currentUserId && rsvpStatus !== 'none' && (
          <p className="text-sm text-violet-200">
            Your RSVP: {rsvpStatus === 'going' ? 'Going' : rsvpStatus === 'interested' ? 'Interested' : 'Not Going'}
          </p>
        )}

        <div className="space-y-3 sm:grid sm:grid-cols-3 sm:gap-3 sm:space-y-0">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="mb-2 text-sm uppercase tracking-[0.32em] text-violet-300">Going</p>
            <p className="text-2xl font-bold text-white">{goingCount}</p>
            <p className="mt-1 text-xs text-white/50">people are going</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="mb-2 text-sm uppercase tracking-[0.32em] text-violet-300">Interested</p>
            <p className="text-2xl font-bold text-white">{interestedCount}</p>
            <p className="mt-1 text-xs text-white/50">people are interested</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="mb-2 text-sm uppercase tracking-[0.32em] text-violet-300">Not Going</p>
            <p className="text-2xl font-bold text-white">{notGoingCount}</p>
            <p className="mt-1 text-xs text-white/50">people are not going</p>
          </div>
        </div>
      </div>
    </section>
  );
}
