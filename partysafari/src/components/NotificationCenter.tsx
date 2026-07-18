"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabaseClient";

type NotificationType =
  | "like_activity"
  | "like_comment"
  | "comment"
  | "follow"
  | "rsvp"
  | "booking_request"
  | "booking_accepted";

interface NotificationRow {
  id: string;
  actor_id: string | null;
  notification_type: NotificationType;
  event_id: string | null;
  activity_id: string | null;
  comment_id: string | null;
  metadata: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

interface NotificationItem extends NotificationRow {
  actor: ProfileRow | null;
}

const notificationTextMap: Record<NotificationType, string> = {
  like_activity: "liked your activity",
  like_comment: "liked your comment",
  comment: "commented on your event",
  follow: "started following you",
  rsvp: "RSVP'd to your event",
  booking_request: "sent a booking request",
  booking_accepted: "accepted your booking request",
};

function formatRelativeTime(dateString: string) {
  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return `${diffSeconds}s ago`;
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  return `${diffDays}d ago`;
}

function getNotificationText(notification: NotificationItem) {
  const actorName = notification.actor?.username
    ? `@${notification.actor.username}`
    : notification.actor?.full_name || "Someone";
  return `${actorName} ${notificationTextMap[notification.notification_type]}`;
}

function getNotificationHref(notification: NotificationItem) {
  switch (notification.notification_type) {
    case "follow":
      return notification.actor_id ? `/profiles/${notification.actor_id}` : "/profiles";
    case "rsvp":
      return notification.event_id ? `/events/${notification.event_id}` : "/events";
    case "comment":
      return notification.event_id ? `/events/${notification.event_id}` : "/feed";
    case "booking_request":
    case "booking_accepted":
      return "/requests";
    case "like_activity":
    case "like_comment":
      return notification.activity_id
        ? `/feed`
        : notification.event_id
        ? `/events/${notification.event_id}`
        : "/feed";
    default:
      return "/";
  }
}

export default function NotificationCenter() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadNotifications = async () => {
      setErrorMessage(null);
      setIsLoading(true);

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) {
        setErrorMessage("Unable to load notifications.");
        setIsLoading(false);
        return;
      }

      const currentUserId = userData?.user?.id ?? null;
      setUserId(currentUserId);
      if (!currentUserId) {
        setNotifications([]);
        setUnreadCount(0);
        setIsLoading(false);
        return;
      }

      const { data: notificationRows, error: notificationError } = await supabase
        .from("notifications")
        .select(
          "id, actor_id, notification_type, event_id, activity_id, comment_id, metadata, is_read, created_at"
        )
        .eq("user_id", currentUserId)
        .order("created_at", { ascending: false });

      if (!isMounted) return;

      if (notificationError) {
        setErrorMessage("Unable to load notifications.");
        setNotifications([]);
        setUnreadCount(0);
        setIsLoading(false);
        return;
      }

      const rows = (notificationRows ?? []) as NotificationRow[];
      const actorIds = [...new Set(rows.map((item) => item.actor_id).filter(Boolean) as string[])];
      let actorProfiles: ProfileRow[] = [];

      if (actorIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, full_name, username, avatar_url")
          .in("id", actorIds);

        actorProfiles = (profilesData ?? []) as ProfileRow[];
      }

      const items = rows.map((row) => ({
        ...row,
        actor: actorProfiles.find((profile) => profile.id === row.actor_id) ?? null,
      }));

      setNotifications(items);
      setUnreadCount(items.filter((item) => !item.is_read).length);
      setIsLoading(false);
    };

    void loadNotifications();
    return () => {
      isMounted = false;
    };
  }, [supabase]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase.channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newNotification = payload.new as NotificationRow;
          setNotifications((current) => [
            {
              ...newNotification,
              actor: null,
            },
            ...current,
          ]);
          setUnreadCount((count) => count + 1);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const updatedNotification = payload.new as NotificationRow;
          setNotifications((current) =>
            current.map((item) =>
              item.id === updatedNotification.id
                ? {
                    ...item,
                    ...updatedNotification,
                  }
                : item
            )
          );
          setUnreadCount((count) =>
            updatedNotification.is_read ? Math.max(0, count - 1) : count
          );
        }
      );

    void channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, userId]);

  const markNotificationAsRead = async (notificationId: string) => {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notificationId);

    if (!error) {
      setNotifications((current) =>
        current.map((item) =>
          item.id === notificationId ? { ...item, is_read: true } : item
        )
      );
      setUnreadCount((count) => Math.max(0, count - 1));
    }
  };

  const markAllAsRead = async () => {
    const unreadIds = notifications.filter((item) => !item.is_read).map((item) => item.id);
    if (unreadIds.length === 0) return;

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .in("id", unreadIds);

    if (!error) {
      setNotifications((current) =>
        current.map((item) => ({ ...item, is_read: true }))
      );
      setUnreadCount(0);
    }
  };

  const handleNotificationClick = async (notification: NotificationItem) => {
    if (!notification.is_read) {
      await markNotificationAsRead(notification.id);
    }

    setIsOpen(false);
    router.push(getNotificationHref(notification));
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-violet-500/30 bg-[#10061f] text-white transition hover:border-violet-300"
        aria-label="Notifications"
      >
        <span className="text-xl">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-violet-500 px-1.5 text-[0.65rem] font-semibold text-white">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-20 mt-3 w-[360px] min-w-[320px] rounded-3xl border border-white/10 bg-[#0c0420] p-4 shadow-[0_20px_70px_rgba(38,12,56,0.45)]">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-white">Notifications</h3>
              <p className="text-sm text-white/60">Latest updates from your network.</p>
            </div>
            <button
              type="button"
              onClick={markAllAsRead}
              className="rounded-2xl bg-white/5 px-3 py-2 text-sm text-violet-300 transition hover:bg-white/10"
            >
              Mark all as read
            </button>
          </div>

          {isLoading ? (
            <div className="rounded-3xl border border-white/10 bg-[#10061f] p-5 text-center text-sm text-white/70">
              Loading notifications...
            </div>
          ) : errorMessage ? (
            <div className="rounded-3xl border border-white/10 bg-[#10061f] p-5 text-sm text-rose-300">
              {errorMessage}
            </div>
          ) : notifications.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-[#10061f] p-5 text-sm text-white/70">
              You have no notifications yet.
            </div>
          ) : (
            <div className="space-y-3">
              {notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => handleNotificationClick(notification)}
                  className={`w-full rounded-3xl border border-white/10 p-3 text-left transition hover:border-violet-400 ${
                    !notification.is_read ? "bg-violet-500/10" : "bg-[#10061f]"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <img
                      src={notification.actor?.avatar_url || "/api/placeholder/40/40"}
                      alt={notification.actor?.username || notification.actor?.full_name || "Actor"}
                      className="h-11 w-11 rounded-full border border-violet-500/20 object-cover"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm text-white">{getNotificationText(notification)}</p>
                        <span className="text-xs text-white/50">{formatRelativeTime(notification.created_at)}</span>
                      </div>
                      <p className="mt-2 text-sm text-white/70">
                        {notification.actor?.username ? `@${notification.actor.username}` : notification.actor?.full_name || "PartySafari user"}
                      </p>
                    </div>
                    {!notification.is_read && (
                      <span className="mt-1 h-2.5 w-2.5 rounded-full bg-violet-400" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
