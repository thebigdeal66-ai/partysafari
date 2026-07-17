'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowser } from '@/lib/supabaseClient';

interface VenueCheckIn {
  venueName: string;
  venueId?: string;
  timestamp?: string;
}

interface EventLink {
  eventId: string;
  eventName: string;
  eventDate?: string;
}

interface ProfileLink {
  profileId: string;
}

export interface FeedPostData {
  id: string;
  activityId?: string;
  type: 'user_activity' | 'club_promotion' | 'event_announcement' | 'entertainer_update' | 'check_in' | 'trending_post' | 'party_photos' | 'dj_mix' | 'business_highlight';
  user: {
    name: string;
    avatar: string;
    username: string;
    badge?: 'verified' | 'dj' | 'club' | 'business';
  };
  timestamp: string;
  content: string;
  image?: string | null;
  likes: number;
  comments: number;
  shares: number;
  rsvps?: number | null;
  trending?: boolean;
  tags?: string[];
  venueCheckIn?: VenueCheckIn;
  eventLink?: EventLink;
  profileLink?: ProfileLink;
  actionLabel?: string;
  metadata?: Record<string, unknown>;
}

interface FeedPostProps {
  post: FeedPostData;
}

export default function FeedPost({ post }: FeedPostProps) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(post.likes);
  const [isLikeBusy, setIsLikeBusy] = useState(false);

  const refreshLikeState = useCallback(async () => {
    if (!post.activityId) {
      setLikeCount(post.likes);
      setLiked(false);
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id ?? null;

    const { data: likeRows, count, error } = await supabase
      .from('activity_likes')
      .select('id', { count: 'exact' })
      .eq('activity_id', post.activityId);

    if (!error) {
      setLikeCount(typeof count === 'number' ? count : likeRows?.length ?? 0);
    }

    if (!userId) {
      setLiked(false);
      return;
    }

    const { data: userLikes, error: userLikeError } = await supabase
      .from('activity_feed_likes')
      .select('id')
      .eq('activity_id', post.activityId)
      .eq('user_id', userId)
      .limit(1);

    if (!userLikeError) {
      setLiked((userLikes ?? []).length > 0);
    }
  }, [post.activityId, post.likes, supabase]);

  useEffect(() => {
    void refreshLikeState();

    if (!post.activityId) {
      return undefined;
    }

    const channel = supabase.channel(`activity-likes-${post.activityId}`);
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'activity_likes', filter: `activity_id=eq.${post.activityId}` },
      () => {
        void refreshLikeState();
      }
    );

    void channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [post.activityId, refreshLikeState, supabase]);

  const handleLike = async () => {
    if (!post.activityId) {
      return;
    }

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user?.id) {
      console.error('Unable to get authenticated user before liking activity:', userError);
      router.push('/login');
      return;
    }

    const userId = userData.user.id;
    setIsLikeBusy(true);

    if (liked) {
      const { error } = await supabase
        .from('activity_feed_likes')
        .delete()
        .eq('activity_id', post.activityId)
        .eq('user_id', userId);

      if (error) {
        if (error.code !== 'PGRST116') {
          console.error('Failed to unlike activity feed post:', error);
          setIsLikeBusy(false);
          return;
        }
      }
    } else {
      const { error } = await supabase.from('activity_likes').insert({
        activity_id: post.activityId,
        user_id: userId,
      });

      if (error) {
        if (error.code !== '23505') {
          console.error('Failed to like activity feed post:', error);
          setIsLikeBusy(false);
          return;
        }
      }
    }

    await refreshLikeState();
    setIsLikeBusy(false);
  };

  const getBadgeStyle = (badge?: string) => {
    switch (badge) {
      case 'verified':
        return 'bg-blue-500/20 text-blue-200';
      case 'dj':
        return 'bg-purple-500/20 text-purple-200';
      case 'club':
        return 'bg-pink-500/20 text-pink-200';
      case 'business':
        return 'bg-violet-500/20 text-violet-200';
      default:
        return '';
    }
  };

  const getBadgeEmoji = (badge?: string) => {
    switch (badge) {
      case 'verified':
        return '✓';
      case 'dj':
        return '🎧';
      case 'club':
        return '🏢';
      case 'business':
        return '⭐';
      default:
        return '';
    }
  };

  const getPostTypeIcon = (type: string) => {
    switch (type) {
      case 'user_activity':
        return '👤';
      case 'club_promotion':
        return '🎉';
      case 'event_announcement':
        return '📣';
      case 'entertainer_update':
        return '🎤';
      case 'check_in':
        return '📍';
      case 'trending_post':
        return '🔥';
      case 'party_photos':
        return '📸';
      case 'dj_mix':
        return '🎵';
      case 'business_highlight':
        return '💼';
      default:
        return '•';
    }
  };

  return (
    <article
      className={`rounded-3xl border border-white/10 bg-[#10061f] p-6 shadow-xl shadow-violet-900/20 transition hover:shadow-violet-900/40 ${
        post.trending ? 'ring-2 ring-violet-500/50' : ''
      }`}
    >
      {/* Post Header */}
      <div className="flex items-start gap-4 mb-4">
        <img
          src={post.user.avatar}
          alt={post.user.name}
          className="h-12 w-12 rounded-full border-2 border-violet-500/20"
        />
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-semibold text-white">{post.user.name}</h3>
            {post.user.badge && (
              <span className={`rounded-full px-2 py-1 text-xs font-medium ${getBadgeStyle(post.user.badge)}`}>
                {getBadgeEmoji(post.user.badge)} {post.user.badge}
              </span>
            )}
            <span className="text-sm text-violet-300">{post.user.username}</span>
            {post.actionLabel && (
              <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-xs font-medium text-violet-200">
                {post.actionLabel}
              </span>
            )}
            {post.trending && (
              <span className="rounded-full bg-violet-500/20 px-2 py-1 text-xs font-medium text-violet-200">
                🔥 Trending
              </span>
            )}
          </div>
          <p className="text-sm text-white/60">{getPostTypeIcon(post.type)} {post.timestamp}</p>
        </div>
      </div>

      {/* Post Content */}
      <div className="mb-4">
        <p className="text-white/90 leading-relaxed">{post.content}</p>
      </div>

      {post.metadata && Object.keys(post.metadata).length > 0 && (
        <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm font-medium text-violet-200">Details</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(post.metadata).map(([key, value]) => {
              const renderedValue = value === null || value === undefined ? '—' : String(value);
              return (
                <span key={key} className="rounded-full border border-white/10 bg-[#07070B] px-3 py-1 text-xs text-white/70">
                  {key}: {renderedValue}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Venue Check-in */}
      {post.venueCheckIn && (
        <div className="mb-4 rounded-2xl bg-gradient-to-r from-pink-500/10 to-violet-500/10 border border-pink-500/30 px-4 py-3 flex items-center gap-3">
          <span className="text-lg">📍</span>
          <div className="flex-1">
            <p className="text-sm font-medium text-pink-200">Checked in at</p>
            <p className="text-white font-semibold">{post.venueCheckIn.venueName}</p>
          </div>
        </div>
      )}

      {/* Event Link */}
      {post.eventLink && (
        <div className="mb-4 rounded-2xl bg-gradient-to-r from-violet-500/10 to-purple-500/10 border border-violet-500/30 px-4 py-3">
          <div className="flex items-start gap-3">
            <span className="text-lg">📅</span>
            <div className="flex-1">
              <p className="text-sm font-medium text-violet-200">Event</p>
              <p className="text-white font-semibold">{post.eventLink.eventName}</p>
              {post.eventLink.eventDate && (
                <p className="text-xs text-white/60 mt-1">{post.eventLink.eventDate}</p>
              )}
            </div>
            <a href={`/events/${post.eventLink.eventId}`} className="text-xs font-semibold text-violet-300 hover:text-violet-100 transition">
              View
            </a>
          </div>
        </div>
      )}

      {post.profileLink && (
        <div className="mb-4 rounded-2xl bg-gradient-to-r from-pink-500/10 to-violet-500/10 border border-pink-500/30 px-4 py-3">
          <div className="flex items-start gap-3">
            <span className="text-lg">👤</span>
            <div className="flex-1">
              <p className="text-sm font-medium text-pink-200">Profile</p>
              <p className="text-white font-semibold">View this profile</p>
            </div>
            <a href={`/profiles/${post.profileLink.profileId}`} className="text-xs font-semibold text-pink-200 hover:text-pink-100 transition">
              Open
            </a>
          </div>
        </div>
      )}

      {/* Post Image */}
      {post.image && (
        <div className="mb-4 overflow-hidden rounded-2xl">
          <img
            src={post.image}
            alt="Post content"
            className="h-64 w-full object-cover hover:scale-105 transition duration-300"
          />
        </div>
      )}

      {/* Nightlife Tags */}
      {post.tags && post.tags.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {post.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-violet-500/20 border border-violet-500/30 px-3 py-1 text-xs font-medium text-violet-200 hover:bg-violet-500/30 cursor-pointer transition"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-between border-t border-white/10 pt-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => void handleLike()}
            disabled={isLikeBusy}
            className={`flex items-center gap-2 rounded-full px-3 py-2 transition ${
              liked
                ? 'bg-violet-500/20 text-violet-200 shadow-lg shadow-violet-500/20'
                : 'text-white/70 hover:bg-violet-500/10 hover:text-violet-200'
            } ${isLikeBusy ? 'opacity-70' : ''}`}
          >
            <span className={`text-lg transition-transform duration-200 ${liked ? 'scale-110 animate-pulse' : 'group-hover:scale-110'}`}>{liked ? '💜' : '🤍'}</span>
            <span className="text-sm font-semibold">{likeCount}</span>
          </button>
          <button className="flex items-center gap-2 text-white/70 transition hover:text-blue-400">
            <span className="text-lg">💬</span>
            <span className="text-sm">{post.comments}</span>
          </button>
          <button className="flex items-center gap-2 text-white/70 transition hover:text-green-400">
            <span className="text-lg">🔗</span>
            <span className="text-sm">{post.shares}</span>
          </button>
          {post.rsvps !== null && post.rsvps !== undefined && (
            <button className="flex items-center gap-2 text-white/70 transition hover:text-violet-400">
              <span className="text-lg">📅</span>
              <span className="text-sm">{post.rsvps} RSVPs</span>
            </button>
          )}
        </div>
        <button className="text-white/50 transition hover:text-white hover:bg-white/10 rounded-full p-1">
          <span className="text-lg">⋯</span>
        </button>
      </div>
    </article>
  );
}
