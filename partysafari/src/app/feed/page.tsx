import type { FeedPostData } from '@/components/FeedPost';
import FeedPageClient from '@/components/feed/FeedPageClient';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

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
    .limit(50);

  if (error || !data || data.length === 0) {
    return [];
  }

  // Deduplicate RSVP activities: keep only the latest per actor_id + event_id
  const rsvpMap = new Map<string, any>();
  const nonRsvpItems: any[] = [];

  for (const item of data) {
    if (item.action_type === 'rsvp' || item.action_type === 'rsvp_event') {
      const key = `${item.actor_id}|${item.event_id}`;
      // Map stores the latest (first encountered due to ordering) RSVP activity
      if (!rsvpMap.has(key)) {
        rsvpMap.set(key, item);
      }
    } else {
      nonRsvpItems.push(item);
    }
  }

  // Combine and re-sort by created_at descending
  const deduplicatedData = [...Array.from(rsvpMap.values()), ...nonRsvpItems];
  deduplicatedData.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  data.splice(0, data.length, ...deduplicatedData.slice(0, 30));

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
    const usernamePlain = actorProfile?.username || (typeof metadata.actor_username === 'string' ? metadata.actor_username : 'member');
    const username = usernamePlain.startsWith('@') ? usernamePlain : `@${usernamePlain}`;
    const avatar = actorProfile?.avatar_url || '';

    // Format event title: trim and capitalize first letter if all lowercase
    const formatEventTitle = (title: string | undefined) => {
      if (!title) return 'an event';
      const trimmed = title.trim();
      if (trimmed.length === 0) return 'an event';
      // If entirely lowercase, capitalize first letter
      if (trimmed === trimmed.toLowerCase()) {
        return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
      }
      return trimmed;
    };

    const eventTitle = formatEventTitle(relatedEvent?.title || fallbackTitle);

    const actionLabels: Record<string, string> = {
      created_event: 'Created Event',
      event_created: 'Created Event',
      rsvp_event: 'RSVP',
      rsvp: 'RSVP',
      commented_event: 'Commented',
      saved_event: 'Saved Event',
      followed_profile: 'Followed Profile',
    };

    // Extract RSVP status for badge styling
    let rsvpStatus: 'going' | 'interested' | null = null;
    if (item.action_type === 'rsvp' || item.action_type === 'rsvp_event') {
      const status = typeof metadata.status === 'string' ? metadata.status : null;
      if (status === 'going' || status === 'interested') {
        rsvpStatus = status;
      }
    }

    const content = (() => {
      switch (item.action_type) {
        case 'created_event':
        case 'event_created':
          const venueName = typeof metadata.venue_name === 'string' ? metadata.venue_name : undefined;
          return venueName ? `created "${eventTitle}" at ${venueName}` : `created "${eventTitle}"`;
        case 'rsvp_event':
        case 'rsvp':
          const rsvpStatusLabel = rsvpStatus === 'going' ? 'is going to' : rsvpStatus === 'interested' ? 'is interested in' : 'rsvp\'d to';
          return `${rsvpStatusLabel} ${eventTitle}`;
        case 'commented_event':
          return `commented on ${eventTitle}`;
        case 'saved_event':
          return `saved ${eventTitle}`;
        case 'followed_profile':
          return relatedProfile?.full_name || relatedProfile?.username || fallbackProfileName || 'followed a profile';
        default:
          return 'performed an action';
      }
    })();

    const profileLabel = relatedProfile?.full_name || relatedProfile?.username || fallbackProfileName || 'This profile';

    let feedContent = '';
    
    // For RSVP and event_created, include actor name directly; otherwise use action label prefix
    if (item.action_type === 'rsvp' || item.action_type === 'rsvp_event' || 
        item.action_type === 'event_created' || item.action_type === 'created_event') {
      feedContent = `${userName} ${content}`;
    } else if (item.action_type === 'followed_profile') {
      feedContent = `${userName} followed ${profileLabel}`;
    } else {
      feedContent = `${actionLabels[item.action_type] || 'Activity'} • ${content}`;
    }

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
      content: feedContent,
      likes: 0,
      comments: 0,
      shares: 0,
      tags: [],
      actionLabel: actionLabels[item.action_type] || 'Activity',
      eventLink: item.event_id
        ? { eventId: String(item.event_id), eventName: eventTitle, eventDate: undefined }
        : undefined,
      profileLink: item.profile_id ? { profileId: String(item.profile_id) } : undefined,
      actorUsername: usernamePlain,
      rsvpStatus,
    };

    return post;
  });
}

export default async function FeedPage() {
  const posts = await loadActivityFeed();

  return <FeedPageClient posts={posts} />;
}