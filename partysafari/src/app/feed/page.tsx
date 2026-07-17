import FeedPost from '@/components/FeedPost';
import type { FeedPostData } from '@/components/FeedPost';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

function formatMetadataValue(value: unknown) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return '';
}

async function loadActivityFeed() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  const { data, error } = await supabase
    .from('activity_feed')
    .select('id, actor_id, action_type, event_id, profile_id, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(30);

  if (error || !data || data.length === 0) {
    return [];
  }

  const profileIds = Array.from(new Set([
    ...data.map((item: any) => item.actor_id).filter(Boolean),
    ...data.map((item: any) => item.profile_id).filter(Boolean),
  ]));
  const eventIds = Array.from(new Set(data.map((item: any) => item.event_id).filter(Boolean)));

  let profileMap = new Map<string, any>();
  let eventMap = new Map<string, any>();

  try {
    if (profileIds.length > 0) {
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, username, avatar_url')
        .in('id', profileIds);

      if (!profilesError && profilesData) {
        profileMap = new Map((profilesData as any[]).map((profile: any) => [profile.id, profile]));
      }
    }
  } catch {
    profileMap = new Map();
  }

  try {
    if (eventIds.length > 0) {
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('id, title')
        .in('id', eventIds);

      if (!eventsError && eventsData) {
        eventMap = new Map((eventsData as any[]).map((event: any) => [event.id, event]));
      }
    }
  } catch {
    eventMap = new Map();
  }

  return data.map((item: any) => {
    const actorProfile = profileMap.get(item.actor_id);
    const relatedProfile = profileMap.get(item.profile_id);
    const relatedEvent = eventMap.get(item.event_id);
    const metadata = (item.metadata && typeof item.metadata === 'object' ? item.metadata : {}) as Record<string, unknown>;

    const fallbackTitle = typeof metadata.title === 'string' ? metadata.title : undefined;
    const fallbackProfileName = typeof metadata.profile_name === 'string'
      ? metadata.profile_name
      : typeof metadata.target_user === 'string'
        ? metadata.target_user
        : undefined;

    const userName = actorProfile?.full_name || actorProfile?.username || metadata.actor_name || 'PartySafari member';
    const username = actorProfile?.username
      ? (actorProfile.username.startsWith('@') ? actorProfile.username : `@${actorProfile.username}`)
      : metadata.actor_username
        ? String(metadata.actor_username)
        : '@member';
    const avatar = actorProfile?.avatar_url || '/api/placeholder/40/40';

    const actionLabels: Record<string, string> = {
      created_event: 'Created Event',
      rsvp_event: 'RSVP',
      commented_event: 'Commented',
      saved_event: 'Saved Event',
      followed_profile: 'Followed Profile',
    };

    const content = (() => {
      switch (item.action_type) {
        case 'created_event':
          return relatedEvent?.title || fallbackTitle || 'created a new event';
        case 'rsvp_event':
          return relatedEvent?.title || fallbackTitle || 'RSVP’d to an event';
        case 'commented_event':
          return relatedEvent?.title || fallbackTitle || 'commented on an event';
        case 'saved_event':
          return relatedEvent?.title || fallbackTitle || 'saved an event';
        case 'followed_profile':
          return relatedProfile?.full_name || relatedProfile?.username || fallbackProfileName || 'followed a profile';
        default:
          return 'performed an action';
      }
    })();

    const eventTitle = relatedEvent?.title || fallbackTitle || 'Related event';
    const profileLabel = relatedProfile?.full_name || relatedProfile?.username || fallbackProfileName || 'This profile';

    const post: FeedPostData = {
      id: String(item.id),
      activityId: String(item.id),
      type: 'user_activity',
      user: {
        name: userName,
        avatar,
        username,
      },
      timestamp: item.created_at ? new Date(item.created_at).toLocaleString() : 'Recently',
      content: `${actionLabels[item.action_type] || 'Activity'} • ${content}`,
      likes: 0,
      comments: 0,
      shares: 0,
      tags: [],
      actionLabel: actionLabels[item.action_type] || 'Activity',
      metadata,
      eventLink: item.event_id
        ? { eventId: String(item.event_id), eventName: eventTitle, eventDate: undefined }
        : undefined,
      profileLink: item.profile_id ? { profileId: String(item.profile_id) } : undefined,
    };

    if (item.action_type === 'followed_profile' && item.profile_id) {
      post.content = `${actionLabels[item.action_type] || 'Activity'} • followed ${profileLabel}`;
    }

    return post;
  });
}

export default async function FeedPage() {
  const posts = await loadActivityFeed();

  return (
    <main className="min-h-screen bg-[#07070B] text-white">
      <div className="mx-auto max-w-4xl px-6 py-8">
        {/* Header */}
        <div className="mb-8 sticky top-0 bg-[#07070B] z-20 py-4 -mx-6 px-6">
          <h1 className="text-4xl font-bold text-white">Nightlife Feed</h1>
          <p className="mt-2 text-lg text-white/70">Stay connected with the PartySafari community</p>
        </div>

        {/* Feed Posts */}
        <div className="space-y-6">
          {posts.map((post) => (
            <FeedPost key={post.id} post={post} />
          ))}
        </div>

        {/* Load More */}
        <div className="mt-8 text-center pb-8">
          <button className="rounded-full border border-violet-500/50 bg-violet-500/10 px-8 py-3 text-sm font-semibold text-violet-200 transition hover:border-violet-300 hover:bg-violet-500/20">
            Load More Posts
          </button>
        </div>
      </div>
    </main>
  );
}