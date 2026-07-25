import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

export const FRIEND_STATE_SYNC_EVENT = "partysafari:friend-state-sync";

export type FriendRelationshipStatus =
  | "none"
  | "request_sent"
  | "request_received"
  | "friends";

export interface FriendRequestPairRow {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: string;
  created_at?: string;
}

export interface FriendRelationshipSnapshot {
  status: FriendRelationshipStatus;
  pendingRequest: FriendRequestPairRow | null;
}

export interface FriendStateSyncDetail {
  reason: "request_sent" | "request_accepted" | "request_declined" | "relationship_refresh";
  currentUserId?: string;
  targetUserId?: string;
  actorId?: string;
  requestId?: string;
}

function relationshipPairFilter(leftId: string, rightId: string, leftCol: string, rightCol: string) {
  return `and(${leftCol}.eq.${leftId},${rightCol}.eq.${rightId}),and(${leftCol}.eq.${rightId},${rightCol}.eq.${leftId})`;
}

export async function fetchFriendRelationship(
  supabase: SupabaseClient,
  currentUserId: string,
  targetUserId: string
): Promise<FriendRelationshipSnapshot> {
  const { data: friendshipRows } = await supabase
    .from("friendships")
    .select("id")
    .or(relationshipPairFilter(currentUserId, targetUserId, "user_id", "friend_id"))
    .limit(1);

  if ((friendshipRows ?? []).length > 0) {
    return { status: "friends", pendingRequest: null };
  }

  const { data: pendingRows } = await supabase
    .from("friend_requests")
    .select("id, sender_id, receiver_id, status, created_at")
    .or(relationshipPairFilter(currentUserId, targetUserId, "sender_id", "receiver_id"))
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1);

  const pendingRequest = ((pendingRows ?? []) as FriendRequestPairRow[])[0] ?? null;

  if (!pendingRequest) {
    return { status: "none", pendingRequest: null };
  }

  if (pendingRequest.sender_id === currentUserId) {
    return { status: "request_sent", pendingRequest };
  }

  return { status: "request_received", pendingRequest };
}

export function isRelationshipConflictError(error: PostgrestError | null) {
  if (!error) {
    return false;
  }

  const haystack = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
  return (
    haystack.includes("already friend") ||
    haystack.includes("already_friends") ||
    haystack.includes("duplicate") ||
    haystack.includes("already exists") ||
    haystack.includes("pending request") ||
    haystack.includes("unique")
  );
}

export function emitFriendStateSync(detail: FriendStateSyncDetail) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent<FriendStateSyncDetail>(FRIEND_STATE_SYNC_EVENT, { detail }));
}

export async function markIncomingFriendRequestNotificationRead(
  supabase: SupabaseClient,
  currentUserId: string,
  senderId: string
) {
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", currentUserId)
    .eq("notification_type", "friend_request")
    .eq("actor_id", senderId)
    .eq("is_read", false);

  if (error && process.env.NODE_ENV === "development") {
    console.warn("[friendSync] could not mark friend request notification as read", error);
  }
}