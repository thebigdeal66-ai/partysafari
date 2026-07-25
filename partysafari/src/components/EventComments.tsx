"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowser } from '@/lib/supabaseClient';
import { recordActivity } from '@/lib/activityFeed';

interface EventCommentRow {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  username: string | null;
}

interface EventComment extends EventCommentRow {
  author_full_name?: string | null;
  author_username?: string | null;
  likeCount?: number;
  likedByUser?: boolean;
}

interface EventCommentsProps {
  eventId: string;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function EventComments({ eventId }: EventCommentsProps) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [comments, setComments] = useState<EventComment[]>([]);
  const [commentBody, setCommentBody] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [likingCommentId, setLikingCommentId] = useState<string | null>(null);

  const loadComments = async () => {
    setErrorMessage(null);
    setIsLoading(true);

    const [{ data: commentRows, error: commentError }, { data: userData }] = await Promise.all([
      supabase
        .from('event_comments')
        .select('id, body, created_at, user_id')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false }),
      supabase.auth.getUser(),
    ]);

    if (commentError) {
      if (process.env.NODE_ENV === "development") {
        console.error('Failed to load comments:', commentError);
      }
      setErrorMessage('Unable to load comments right now.');
      setIsLoading(false);
      return;
    }

    setCurrentUserId(userData?.user?.id ?? null);

    const rows: EventCommentRow[] = (commentRows ?? []) as EventCommentRow[];
    if (rows.length === 0) {
      setComments([]);
      setIsLoading(false);
      return;
    }

    const userIds = Array.from(new Set(rows.map((row) => row.user_id)));
    const { data: profileRows, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, username')
      .in('id', userIds);

    if (profileError) {
      console.warn('Unable to load profile names for comments:', profileError);
    }

    const typedProfileRows: ProfileRow[] = (profileRows ?? []) as ProfileRow[];
    const profileMap = new Map(typedProfileRows.map((profile) => [profile.id, profile]));
    const commentIds = rows.map((row) => row.id);
    let likeRows: Array<{ comment_id: string; user_id: string }> = [];

    if (commentIds.length > 0) {
      const { data, error } = await supabase.from('comment_likes').select('comment_id, user_id').in('comment_id', commentIds);
      if (!error) {
        likeRows = (data ?? []) as Array<{ comment_id: string; user_id: string }>;
      }
    }

    const likeCountMap = new Map<string, number>();
    const likedCommentIds = new Set<string>();

    likeRows.forEach((likeRow) => {
      const currentCount = likeCountMap.get(likeRow.comment_id) ?? 0;
      likeCountMap.set(likeRow.comment_id, currentCount + 1);
      if (userData?.user?.id && likeRow.user_id === userData.user.id) {
        likedCommentIds.add(likeRow.comment_id);
      }
    });

    setComments(
      rows.map((row) => {
        const profile = profileMap.get(row.user_id);
        return {
          ...row,
          author_full_name: profile?.full_name || null,
          author_username: profile?.username || null,
          likeCount: likeCountMap.get(row.id) ?? 0,
          likedByUser: likedCommentIds.has(row.id),
        };
      })
    );

    setIsLoading(false);
  };

  useEffect(() => {
    void loadComments();

    const channel = supabase.channel(`event-comment-likes-${eventId}`);
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'comment_likes' },
      () => {
        void loadComments();
      }
    );

    void channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [eventId, supabase]);

  const handleSubmit = async () => {
    setErrorMessage(null);
    const trimmed = commentBody.trim();
    if (!trimmed) {
      setErrorMessage('Comment cannot be empty.');
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.id) {
      router.push('/login');
      return;
    }

    setIsSaving(true);

    const { error } = await supabase.from('event_comments').insert({
      event_id: eventId,
      user_id: user.id,
      body: trimmed,
    });

    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.error('Failed to save comment:', error);
      }
      setErrorMessage('There was a problem posting your comment.');
      setIsSaving(false);
      return;
    }

    await recordActivity({
      actorId: user.id,
      actionType: 'commented_event',
      eventId,
      metadata: { body: trimmed },
    });

    setCommentBody('');
    await loadComments();
    setIsSaving(false);
  };

  const handleCommentLike = async (commentId: string, currentlyLiked: boolean) => {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user?.id) {
      if (process.env.NODE_ENV === "development") {
        console.error('Unable to get authenticated user before liking comment:', userError);
      }
      router.push('/login');
      return;
    }

    const userId = userData.user.id;
    setLikingCommentId(commentId);

    if (currentlyLiked) {
      const { error } = await supabase
        .from('comment_likes')
        .delete()
        .eq('comment_id', commentId)
        .eq('user_id', userId);

      if (error) {
        if (error.code !== 'PGRST116') {
          if (process.env.NODE_ENV === "development") {
            console.error('Failed to unlike comment:', error);
          }
          setLikingCommentId(null);
          return;
        }
      }
    } else {
      const { error } = await supabase.from('comment_likes').insert({
        comment_id: commentId,
        user_id: userId,
      });

      if (error) {
        if (error.code !== '23505') {
          if (process.env.NODE_ENV === "development") {
            console.error('Failed to like comment:', error);
          }
          setLikingCommentId(null);
          return;
        }
      }
    }

    await loadComments();
    setLikingCommentId(null);
  };

  const commentCount = comments.length;

  return (
    <section className="rounded-3xl border border-white/10 bg-[#10061f] p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-white">Event Comments</h2>
          <p className="text-sm text-white/60">
            {commentCount === 0
              ? 'No comments yet. Be the first to leave a note.'
              : `${commentCount} comment${commentCount !== 1 ? 's' : ''}`}
          </p>
        </div>
        {!currentUserId ? (
          <Link
            href="/login"
            className="inline-flex items-center rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-sm font-semibold text-violet-200 transition hover:bg-violet-500/20"
          >
            Log in to comment
          </Link>
        ) : null}
      </div>

      <div className="space-y-4">
        <label className="space-y-2 text-sm text-white/70">
          <span>Your comment</span>
          <textarea
            value={commentBody}
            onChange={(event) => setCommentBody(event.target.value)}
            placeholder={currentUserId ? 'Share your thoughts...' : 'Log in to leave a comment.'}
            disabled={!currentUserId || isSaving}
            className="w-full min-h-[120px] rounded-3xl border border-white/10 bg-[#07070B] px-4 py-3 text-white outline-none focus:border-violet-400"
          />
        </label>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!currentUserId || isSaving}
            className="inline-flex items-center justify-center rounded-full bg-violet-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? 'Posting...' : 'Post Comment'}
          </button>
          {errorMessage ? (
            <p className="text-sm text-rose-300">{errorMessage}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-8 space-y-4">
        {isLoading ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white/70">Loading comments...</div>
        ) : comments.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white/70">
            No comments yet — start the conversation.
          </div>
        ) : (
          comments.map((comment) => {
            const label = comment.author_full_name || comment.author_username || 'Anonymous';
            const subtitle = comment.author_username ? `@${comment.author_username}` : comment.author_full_name ? comment.author_full_name : 'Guest';
            return (
              <article key={comment.id} className="rounded-3xl border border-white/10 bg-[#0e0e1f] p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{label}</p>
                    <p className="text-sm text-white/50">{subtitle}</p>
                  </div>
                  <time className="text-xs uppercase tracking-[0.24em] text-white/40" dateTime={comment.created_at}>
                    {formatDateTime(comment.created_at)}
                  </time>
                </div>
                <p className="mt-4 whitespace-pre-line text-white/80">{comment.body}</p>
                <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
                  <button
                    type="button"
                    onClick={() => void handleCommentLike(comment.id, !!comment.likedByUser)}
                    disabled={likingCommentId === comment.id}
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm transition ${
                      comment.likedByUser
                        ? 'bg-violet-500/20 text-violet-200 shadow-lg shadow-violet-500/20'
                        : 'bg-white/5 text-white/70 hover:bg-violet-500/10 hover:text-violet-200'
                    } ${likingCommentId === comment.id ? 'opacity-70' : ''}`}
                  >
                    <span className={`text-base transition-transform duration-200 ${comment.likedByUser ? 'scale-110 animate-pulse' : ''}`}>
                      {comment.likedByUser ? '💜' : '🤍'}
                    </span>
                    <span>{comment.likeCount ?? 0}</span>
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
