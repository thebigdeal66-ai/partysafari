'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowser } from '@/lib/supabaseClient';
import { recordActivity } from '@/lib/activityFeed';

interface EventRsvpControlsProps {
  eventId: string;
  eventTitle: string;
  compact?: boolean;
}

type RsvpStatus = 'going' | 'interested' | 'not_going' | null;

type EventRsvpRow = {
  status: string | null;
  user_id: string | null;
};

export default function EventRsvpControls({
  eventId,
  eventTitle,
  compact = false,
}: EventRsvpControlsProps) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  
  const [myStatus, setMyStatus] = useState<RsvpStatus>(null);
  const [goingCount, setGoingCount] = useState(0);
  const [interestedCount, setInterestedCount] = useState(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const refreshCounts = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id ?? null;
    setCurrentUserId(userId);

    const { data: rsvpRows } = await supabase
      .from('event_rsvps')
      .select('status, user_id')
      .eq('event_id', eventId);

    const rows: EventRsvpRow[] = (rsvpRows ?? []) as EventRsvpRow[];
    setGoingCount(rows.filter((row) => row.status === 'going').length);
    setInterestedCount(rows.filter((row) => row.status === 'interested').length);

    if (userId) {
      const userRow = rows.find((row) => row.user_id === userId);
      setMyStatus((userRow?.status as RsvpStatus) || null);
    } else {
      setMyStatus(null);
    }
  }, [eventId, supabase]);

  useEffect(() => {
    let isActive = true;

    const initialize = async () => {
      await refreshCounts();
    };

    void initialize();

    const channel = supabase.channel(`event-rsvp-${eventId}`);
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
          void refreshCounts();
        }
      }
    );

    void channel.subscribe();

    return () => {
      isActive = false;
      void supabase.removeChannel(channel);
    };
  }, [eventId, refreshCounts, supabase]);

  const handleRsvp = useCallback(async (status: 'going' | 'interested' | 'not_going') => {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user?.id) {
      router.push(`/login?next=${encodeURIComponent(`/events/${eventId}`)}`);
      return;
    }

    setIsSaving(true);
    const previousStatus = myStatus;

    // Optimistic update
    if (status === 'going') {
      setGoingCount((prev) => previousStatus === 'going' ? prev : (previousStatus === 'interested' ? prev + 1 : prev + 1));
      setInterestedCount((prev) => previousStatus === 'interested' ? prev - 1 : prev);
    } else if (status === 'interested') {
      setInterestedCount((prev) => previousStatus === 'interested' ? prev : (previousStatus === 'going' ? prev + 1 : prev + 1));
      setGoingCount((prev) => previousStatus === 'going' ? prev - 1 : prev);
    }
    setMyStatus(status);

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

    if (error) {
      // Rollback on error
      await refreshCounts();
      setIsSaving(false);
      return;
    }

    // Record activity only for going or interested
    if (status === 'going' || status === 'interested') {
      await recordActivity({
        actorId: user.id,
        actionType: 'rsvp',
        eventId,
        profileId: user.id,
        metadata: {
          status,
          event_title: eventTitle,
        },
      }).catch((err) => {
        if (process.env.NODE_ENV === "development") {
          console.error('Failed to record RSVP activity:', err);
        }
      });
    } else if (status === 'not_going') {
      // Delete RSVP activity for not_going status
      // (The feed already handles this - we just remove the RSVP record)
    }

    await refreshCounts();
    setIsSaving(false);
  }, [eventId, eventTitle, myStatus, supabase, router, refreshCounts]);

  if (compact) {
    return (
      <div className="space-y-2 text-xs">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => void handleRsvp('going')}
            disabled={isSaving}
            className={`rounded-full px-2.5 py-1 font-semibold transition ${
              myStatus === 'going'
                ? 'bg-violet-600 text-white'
                : 'border border-violet-400/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20'
            } ${isSaving ? 'opacity-60' : ''}`}
          >
            {myStatus === 'going' ? '✓ Going' : 'Going'}
          </button>
          <button
            onClick={() => void handleRsvp('interested')}
            disabled={isSaving}
            className={`rounded-full px-2.5 py-1 font-semibold transition ${
              myStatus === 'interested'
                ? 'bg-pink-600 text-white'
                : 'border border-pink-400/30 bg-pink-500/10 text-pink-200 hover:bg-pink-500/20'
            } ${isSaving ? 'opacity-60' : ''}`}
          >
            {myStatus === 'interested' ? '✓ Interested' : 'Interested'}
          </button>
        </div>
        <div className="flex gap-2 text-white/70">
          <span>🔴 {goingCount} going</span>
          <span>📌 {interestedCount} interested</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          onClick={() => void handleRsvp('going')}
          disabled={isSaving}
          className={`flex-1 rounded-full px-4 py-2 font-semibold transition ${
            myStatus === 'going'
              ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white'
              : 'border border-violet-400/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20'
          } ${isSaving ? 'opacity-60' : ''}`}
        >
          {myStatus === 'going' ? '✓ Going' : 'Going'}
        </button>
        <button
          onClick={() => void handleRsvp('interested')}
          disabled={isSaving}
          className={`flex-1 rounded-full px-4 py-2 font-semibold transition ${
            myStatus === 'interested'
              ? 'bg-gradient-to-r from-pink-600 to-rose-600 text-white'
              : 'border border-pink-400/30 bg-pink-500/10 text-pink-200 hover:bg-pink-500/20'
          } ${isSaving ? 'opacity-60' : ''}`}
        >
          {myStatus === 'interested' ? '✓ Interested' : 'Interested'}
        </button>
        <button
          onClick={() => void handleRsvp('not_going')}
          disabled={isSaving}
          className={`flex-1 rounded-full px-4 py-2 font-semibold transition ${
            myStatus === 'not_going'
              ? 'bg-slate-600 text-white'
              : 'border border-slate-400/30 bg-slate-500/10 text-slate-200 hover:bg-slate-500/20'
          } ${isSaving ? 'opacity-60' : ''}`}
        >
          {myStatus === 'not_going' ? '✓ Not Going' : 'Not Going'}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-white/5 px-2 py-1">
          <p className="font-semibold text-violet-300">{goingCount} Going</p>
        </div>
        <div className="rounded-lg bg-white/5 px-2 py-1">
          <p className="font-semibold text-pink-300">{interestedCount} Interested</p>
        </div>
      </div>
    </div>
  );
}
