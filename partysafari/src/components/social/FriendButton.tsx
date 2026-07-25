"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabaseClient";
import {
  emitFriendStateSync,
  fetchFriendRelationship,
  FRIEND_STATE_SYNC_EVENT,
  isRelationshipConflictError,
  markIncomingFriendRequestNotificationRead,
  type FriendRelationshipStatus,
  type FriendRequestPairRow,
  type FriendStateSyncDetail,
} from "@/lib/friendSync";

type FriendshipStatus = FriendRelationshipStatus | "loading";

interface FriendButtonProps {
  targetUserId: string;
  compact?: boolean;
  className?: string;
}

export default function FriendButton({ targetUserId, compact = false, className }: FriendButtonProps) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [status, setStatus] = useState<FriendshipStatus>("loading");
  const [pendingRequest, setPendingRequest] = useState<FriendRequestPairRow | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resolveStatus = useCallback(async (userId: string) => {
    const snapshot = await fetchFriendRelationship(supabase, userId, targetUserId);
    setStatus(snapshot.status);
    setPendingRequest(snapshot.pendingRequest);
  }, [supabase, targetUserId]);

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id ?? null;

      if (!isMounted) return;

      setCurrentUserId(userId);

      if (!userId || userId === targetUserId) {
        setStatus("none");
        return;
      }

      await resolveStatus(userId);
    };

    void init();

    return () => {
      isMounted = false;
    };
  }, [supabase, targetUserId, resolveStatus]);

  // Realtime subscription for friend requests and friendships
  useEffect(() => {
    if (!currentUserId || currentUserId === targetUserId) return;

    const channel = supabase.channel(`friend-state-${currentUserId}-${targetUserId}`);

    channel
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "friend_requests",
      }, () => {
        void resolveStatus(currentUserId);
      })
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "friendships",
      }, () => {
        void resolveStatus(currentUserId);
      });

    void channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, targetUserId, supabase, resolveStatus]);

  useEffect(() => {
    if (!currentUserId || currentUserId === targetUserId) {
      return;
    }

    const handleFriendSync = (event: Event) => {
      const custom = event as CustomEvent<FriendStateSyncDetail>;
      const detail = custom.detail;
      if (!detail) {
        return;
      }

      const touchesCurrent =
        detail.currentUserId === currentUserId || detail.targetUserId === currentUserId;
      const touchesTarget =
        detail.currentUserId === targetUserId || detail.targetUserId === targetUserId;

      if (!touchesCurrent && !touchesTarget) {
        return;
      }

      void resolveStatus(currentUserId);
    };

    window.addEventListener(FRIEND_STATE_SYNC_EVENT, handleFriendSync);
    return () => {
      window.removeEventListener(FRIEND_STATE_SYNC_EVENT, handleFriendSync);
    };
  }, [currentUserId, targetUserId, resolveStatus]);

  const handleSendRequest = useCallback(async () => {
    if (!currentUserId || isBusy) return;

    setIsBusy(true);
    setErrorMessage(null);

    const latest = await fetchFriendRelationship(supabase, currentUserId, targetUserId);
    if (latest.status !== "none") {
      setStatus(latest.status);
      setPendingRequest(latest.pendingRequest);
      setIsBusy(false);
      return;
    }

    const previousStatus = status;
    setStatus("request_sent");

    const { error } = await supabase.rpc("send_friend_request", {
      p_receiver_id: targetUserId,
    });

    if (error) {
      if (isRelationshipConflictError(error)) {
        await resolveStatus(currentUserId);
        emitFriendStateSync({
          reason: "relationship_refresh",
          currentUserId,
          targetUserId,
        });
      } else {
        if (process.env.NODE_ENV === "development") {
          console.warn("[FriendButton] send_friend_request failed:", error);
        }
        setStatus(previousStatus);
        setErrorMessage("Could not send friend request right now.");
      }
    } else {
      await resolveStatus(currentUserId);
      emitFriendStateSync({
        reason: "request_sent",
        currentUserId,
        targetUserId,
      });
    }

    setIsBusy(false);
  }, [currentUserId, isBusy, status, supabase, targetUserId, resolveStatus]);

  const handleRespond = useCallback(async (action: "accept" | "decline") => {
    if (!pendingRequest || !currentUserId || isBusy) return;

    setIsBusy(true);
    setErrorMessage(null);
    const previousStatus = status;
    setStatus(action === "accept" ? "friends" : "none");

    const { error } = await supabase.rpc("respond_to_friend_request", {
      p_request_id: pendingRequest.id,
      p_action: action,
    });

    if (error) {
      if (isRelationshipConflictError(error)) {
        await resolveStatus(currentUserId);
        emitFriendStateSync({
          reason: "relationship_refresh",
          currentUserId,
          targetUserId,
        });
      } else {
        if (process.env.NODE_ENV === "development") {
          console.warn("[FriendButton] respond_to_friend_request failed:", error);
        }
        setStatus(previousStatus);
        setErrorMessage(`Could not ${action} request right now.`);
      }
    } else {
      if (action === "accept") {
        const senderId = pendingRequest.sender_id;
        await markIncomingFriendRequestNotificationRead(supabase, currentUserId, senderId);
      }

      await resolveStatus(currentUserId);
      emitFriendStateSync({
        reason: action === "accept" ? "request_accepted" : "request_declined",
        currentUserId,
        targetUserId,
        actorId: pendingRequest.sender_id,
        requestId: pendingRequest.id,
      });
    }

    setIsBusy(false);
  }, [pendingRequest, currentUserId, isBusy, status, supabase, resolveStatus, targetUserId]);

  // Don't render for own profile or unauthenticated
  if (!currentUserId || currentUserId === targetUserId) return null;

  if (status === "loading") {
    return (
      <div className={`h-9 w-24 animate-pulse rounded-full bg-white/10 ${className ?? ""}`} />
    );
  }

  const base = `rounded-full px-${compact ? "3" : "4"} py-${compact ? "1.5" : "2"} text-sm font-semibold transition disabled:opacity-60`;

  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <div className="flex gap-2">
        {status === "none" && (
          <button
            onClick={() => void handleSendRequest()}
            disabled={isBusy}
            className={`${base} border border-violet-500/50 bg-violet-500/10 text-violet-200 hover:border-violet-300 hover:bg-violet-500/20`}
          >
            {isBusy ? "Sending…" : "Add Friend"}
          </button>
        )}

        {status === "request_sent" && (
          <button
            disabled
            className={`${base} border border-white/20 bg-white/10 text-white/50 cursor-not-allowed`}
          >
            Request Sent
          </button>
        )}

        {status === "request_received" && (
          <>
            <button
              onClick={() => void handleRespond("accept")}
              disabled={isBusy}
              className={`${base} bg-violet-600 text-white hover:bg-violet-500`}
            >
              {isBusy ? "…" : "Accept"}
            </button>
            <button
              onClick={() => void handleRespond("decline")}
              disabled={isBusy}
              className={`${base} border border-white/20 bg-white/5 text-white/70 hover:bg-white/10`}
            >
              Decline
            </button>
          </>
        )}

        {status === "friends" && (
          <span className={`${base} border border-green-500/30 bg-green-500/10 text-green-300 cursor-default`}>
            ✓ Friends
          </span>
        )}
      </div>

      {errorMessage && (
        <p className="text-xs text-rose-400">{errorMessage}</p>
      )}
    </div>
  );
}
