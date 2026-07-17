"use client";

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowser } from '@/lib/supabaseClient';
import { recordActivity } from '@/lib/activityFeed';

interface SavedEventToggleProps {
  eventId: string;
}

export default function SavedEventToggle({ eventId }: SavedEventToggleProps) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [isSaved, setIsSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [savedRecordId, setSavedRecordId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadSavedState = async () => {
    setErrorMessage(null);
    setIsLoading(true);

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      setIsSaved(false);
      setIsLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('saved_events')
      .select('id')
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Failed to load saved event state:', error);
      setErrorMessage('Unable to check saved state right now.');
    }

    setIsSaved(!!data);
    setSavedRecordId(data?.id ?? null);
    setIsLoading(false);
  };

  useEffect(() => {
    void loadSavedState();
  }, [eventId]);

  const handleToggle = async () => {
    setErrorMessage(null);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;

    if (!userId) {
      router.push('/login');
      return;
    }

    setIsLoading(true);

    if (isSaved && savedRecordId) {
      const { error } = await supabase.from('saved_events').delete().eq('id', savedRecordId);
      if (error) {
        console.error('Failed to unsave event:', error);
        setErrorMessage('Unable to unsave event right now.');
        setIsLoading(false);
        return;
      }

      setIsSaved(false);
      setSavedRecordId(null);
      setIsLoading(false);
      return;
    }

    const { data, error } = await supabase.from('saved_events').insert({
      event_id: eventId,
      user_id: userId,
    }).select('id').single();

    if (error) {
      console.error('Failed to save event:', error);
      setErrorMessage('Unable to save event right now.');
      setIsLoading(false);
      return;
    }

    await recordActivity({
      actorId: userId,
      actionType: 'saved_event',
      eventId,
      metadata: { eventId },
    });

    setIsSaved(true);
    setSavedRecordId(data?.id ?? null);
    setIsLoading(false);
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleToggle}
        disabled={isLoading}
        className={`inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition ${
          isSaved
            ? 'bg-emerald-500 text-white hover:bg-emerald-400'
            : 'border border-white/10 bg-white/5 text-white hover:border-emerald-400 hover:bg-emerald-500/10'
        } ${isLoading ? 'cursor-not-allowed opacity-70' : ''}`}
      >
        {isSaved ? 'Saved' : 'Save Event'}
      </button>
      {errorMessage ? <p className="text-sm text-rose-300">{errorMessage}</p> : null}
    </div>
  );
}
