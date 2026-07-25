"use client";

import type { RealtimePostgresInsertPayload } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { createSupabaseBrowser } from "@/lib/supabaseClient";

type ConversationSummary = {
  id: string;
  name: string;
  avatarUrl: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unread: boolean;
  unread_count: number;
};

type DirectMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

type DirectMessageInsertPayload = RealtimePostgresInsertPayload<DirectMessage>;

type ProfileSearchResult = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

type UnreadCountRow = {
  conversation_id: string;
  unread_count: number;
};

function formatMessageTime(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const MESSAGES_READ_EVENT = "partysafari:messages-read";

function MessagesPageContent() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<ProfileSearchResult[]>([]);
  const [searchingProfiles, setSearchingProfiles] = useState(false);
  const [startingConversation, setStartingConversation] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const latestMessageRequestRef = useRef<string | null>(null);
  const selectedConversationIdRef = useRef<string | null>(null);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId) || null,
    [conversations, selectedConversationId]
  );

  const scrollToLatestMessage = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const refreshConversations = useCallback(async () => {
    const supabase = createSupabaseBrowser();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.user?.id) {
      return;
    }

    const userId = session.user.id;
    setCurrentUserId(userId);

    const { data: participantRows, error: participantError } = await supabase
      .from("conversation_participants")
      .select("conversation_id, last_read_at")
      .eq("profile_id", userId)
      .order("joined_at", { ascending: true });

    if (participantError) {
      if (process.env.NODE_ENV === "development") {
        console.error("[messages] Participant query failed:", participantError);
      }
      setConversationError("Could not load your conversations.");
      return;
    }

    const { data: unreadCountRows, error: unreadCountError } = await supabase.rpc("get_unread_message_counts");
    const unreadCountByConversationId = new Map<string, number>();

    if (!unreadCountError && Array.isArray(unreadCountRows)) {
      for (const row of unreadCountRows as UnreadCountRow[]) {
        if (row?.conversation_id) {
          unreadCountByConversationId.set(row.conversation_id, Number(row.unread_count || 0));
        }
      }
    }

    const conversationSummaries: ConversationSummary[] = [];

    for (const participant of participantRows || []) {
      const { data: conversationRow, error: conversationErrorData } = await supabase
        .from("conversations")
        .select("id, last_message_at, created_at")
        .eq("id", participant.conversation_id)
        .maybeSingle();

      if (conversationErrorData || !conversationRow) {
        continue;
      }

      const { data: latestMessages, error: latestMessagesError } = await supabase
        .from("direct_messages")
        .select("id, body, created_at, sender_id")
        .eq("conversation_id", conversationRow.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (latestMessagesError) {
        continue;
      }

      const latestMessage = latestMessages?.[0] || null;

      const { data: otherParticipants, error: otherParticipantError } = await supabase
        .from("conversation_participants")
        .select("profile_id")
        .eq("conversation_id", conversationRow.id)
        .neq("profile_id", userId);

      if (otherParticipantError) {
        continue;
      }

      const otherProfileId = otherParticipants?.[0]?.profile_id || null;
      const { data: profileRow } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_url")
        .eq("id", otherProfileId)
        .maybeSingle();

      const unreadCount = unreadCountByConversationId.get(conversationRow.id) || 0;
      const legacyUnread = Boolean(
        latestMessage &&
          (!participant.last_read_at || new Date(latestMessage.created_at) > new Date(participant.last_read_at)) &&
          latestMessage.sender_id !== userId
      );

      conversationSummaries.push({
        id: conversationRow.id,
        name: profileRow?.display_name || profileRow?.username || "Conversation",
        avatarUrl: profileRow?.avatar_url || null,
        lastMessage: latestMessage?.body || null,
        lastMessageAt: latestMessage?.created_at || conversationRow.last_message_at || conversationRow.created_at || null,
        unread_count: unreadCount,
        unread: unreadCount > 0 || legacyUnread,
      });
    }

    conversationSummaries.sort((left, right) => {
      const leftTime = left.lastMessageAt ? new Date(left.lastMessageAt).getTime() : 0;
      const rightTime = right.lastMessageAt ? new Date(right.lastMessageAt).getTime() : 0;
      return rightTime - leftTime;
    });

    setConversations(conversationSummaries);
    setConversationError(null);

    if (!selectedConversationId && conversationSummaries[0]?.id) {
      setSelectedConversationId(conversationSummaries[0].id);
    }
  }, [selectedConversationId]);

  const refreshUnreadCounts = useCallback(async (conversationIdToPrioritize?: string) => {
    const supabase = createSupabaseBrowser();
    const { data, error } = await supabase.rpc("get_unread_message_counts");

    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[messages] Unread counts RPC failed:", error);
      }
      return;
    }

    const unreadCountByConversationId = new Map<string, number>();
    if (Array.isArray(data)) {
      for (const row of data as UnreadCountRow[]) {
        if (row?.conversation_id) {
          unreadCountByConversationId.set(row.conversation_id, Number(row.unread_count || 0));
        }
      }
    }

    setConversations((previous) => {
      const updated = previous.map((conversation) => {
        const unreadCount = unreadCountByConversationId.get(conversation.id) || 0;
        return {
          ...conversation,
          unread_count: unreadCount,
          unread: unreadCount > 0,
        };
      });

      if (!conversationIdToPrioritize) {
        return updated;
      }

      const targetIndex = updated.findIndex((conversation) => conversation.id === conversationIdToPrioritize);
      if (targetIndex < 0) {
        return updated;
      }

      const [conversationToTop] = updated.splice(targetIndex, 1);
      return [conversationToTop, ...updated];
    });
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    const supabase = createSupabaseBrowser();
    latestMessageRequestRef.current = conversationId;
    setMessagesLoading(true);

    const { data, error } = await supabase
      .from("direct_messages")
      .select("id, conversation_id, sender_id, body, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (latestMessageRequestRef.current !== conversationId) {
      return;
    }

    if (error) {
      setNotice("Could not load your messages right now.");
      setMessagesLoading(false);
      return;
    }

    const orderedMessages = [...(data || [])].sort((left, right) => {
      const leftTime = new Date(left.created_at).getTime();
      const rightTime = new Date(right.created_at).getTime();
      return leftTime - rightTime;
    });

    setMessages(orderedMessages);
    setMessagesLoading(false);
  }, []);

  const markConversationRead = useCallback(async (conversationId: string) => {
    if (!currentUserId) {
      return false;
    }

    const supabase = createSupabaseBrowser();
    const { error } = await supabase.rpc("mark_conversation_read", {
      p_conversation_id: conversationId,
    });

    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[messages] Mark conversation read failed:", error);
      }
      return false;
    }

    setConversations((previous) =>
      previous.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, unread_count: 0, unread: false }
          : conversation
      )
    );

    window.dispatchEvent(
      new CustomEvent(MESSAGES_READ_EVENT, {
        detail: { conversationId },
      })
    );

    return true;
  }, [currentUserId]);

  const handleSelectConversation = useCallback(
    async (conversationId: string) => {
      setSelectedConversationId(conversationId);
      selectedConversationIdRef.current = conversationId;
      setNotice(null);
      setConversations((previous) =>
        previous.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, unread_count: 0, unread: false }
            : conversation
        )
      );
      await loadMessages(conversationId);
      await markConversationRead(conversationId);
    },
    [loadMessages, markConversationRead]
  );

  const searchProfiles = useCallback(async (term: string) => {
    const trimmed = term.trim();
    setSearchTerm(term);

    if (!trimmed) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }

    const supabase = createSupabaseBrowser();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.user?.id) {
      setSearchError("Please sign in again to start a new chat.");
      return;
    }

    setSearchingProfiles(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, username, avatar_url")
      .neq("id", session.user.id)
      .or(`display_name.ilike.%${trimmed}%,username.ilike.%${trimmed}%`)
      .limit(8);

    setSearchingProfiles(false);

    if (error) {
      setSearchError("Could not search profiles right now.");
      setSearchResults([]);
      return;
    }

    setSearchResults(data || []);
    setSearchError(null);
  }, []);

  const handleStartConversation = useCallback(
    async (profileId: string) => {
      const supabase = createSupabaseBrowser();
      setStartingConversation(true);
      setNotice(null);
      setSearchError(null);

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.user?.id) {
        setSearchError("Please sign in again to start a new chat.");
        setStartingConversation(false);
        return;
      }

      const { data, error } = await supabase.rpc("start_direct_conversation", {
        p_other_profile_id: profileId,
      });

      if (error) {
        setSearchError(error.message || "Could not create a new conversation.");
        setStartingConversation(false);
        return;
      }

      const conversationId = typeof data === "string" ? data : data?.toString();
      if (!conversationId) {
        setSearchError("The conversation could not be started.");
        setStartingConversation(false);
        return;
      }

      await refreshConversations();
      await handleSelectConversation(conversationId);
      setSearchTerm("");
      setSearchResults([]);
      setStartingConversation(false);
    },
    [handleSelectConversation, refreshConversations]
  );

  const handleSendMessage = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed || !selectedConversationId || !currentUserId) {
      return;
    }

    const supabase = createSupabaseBrowser();
    setSending(true);
    setNotice(null);

    const { data, error } = await supabase
      .from("direct_messages")
      .insert({
        conversation_id: selectedConversationId,
        sender_id: currentUserId,
        body: trimmed,
      })
      .select("id, conversation_id, sender_id, body, created_at")
      .single();

    if (error) {
      setNotice(error.message || "Your message could not be sent.");
      setSending(false);
      return;
    }

    if (data) {
      setMessages((previous) => {
        if (previous.some((message) => message.id === data.id)) {
          return previous;
        }

        return [...previous, data];
      });
    }

    setDraft("");
    await refreshConversations();
    setSending(false);
  }, [currentUserId, draft, refreshConversations, selectedConversationId]);

  useEffect(() => {
    let ignored = false;

    async function initialize() {
      const supabase = createSupabaseBrowser();
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (ignored) {
        return;
      }

      if (sessionError || !session?.user?.id) {
        setLoading(false);
        return;
      }

      setCurrentUserId(session.user.id);
      setLoading(false);
      await refreshConversations();
    }

    void initialize();

    return () => {
      ignored = true;
    };
  }, [refreshConversations]);

  useEffect(() => {
    scrollToLatestMessage();
  }, [messages, scrollToLatestMessage]);

  useEffect(() => {
    selectedConversationIdRef.current = selectedConversationId;
  }, [selectedConversationId]);

  useEffect(() => {
    if (!selectedConversationId) {
      latestMessageRequestRef.current = null;
      setMessages([]);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void loadMessages(selectedConversationId);
      void markConversationRead(selectedConversationId);
      setConversations((previous) =>
        previous.map((conversation) =>
          conversation.id === selectedConversationId
            ? { ...conversation, unread_count: 0, unread: false }
            : conversation
        )
      );
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadMessages, markConversationRead, selectedConversationId]);

  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    const supabase = createSupabaseBrowser();
    const channel = supabase.channel("direct-messages-realtime");

    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "direct_messages",
      },
      (payload: DirectMessageInsertPayload) => {
        const incoming = payload.new;
        if (!incoming?.conversation_id) {
          return;
        }

        const isSelectedConversation = selectedConversationIdRef.current === incoming.conversation_id;

        if (isSelectedConversation) {
          setMessages((previous) => {
            if (previous.some((message) => message.id === incoming.id)) {
              return previous;
            }

            return [...previous, incoming].sort((left, right) => {
              const leftTime = new Date(left.created_at).getTime();
              const rightTime = new Date(right.created_at).getTime();
              return leftTime - rightTime;
            });
          });

          setConversations((previous) => {
            const existingIndex = previous.findIndex((conversation) => conversation.id === incoming.conversation_id);
            if (existingIndex < 0) {
              return previous;
            }

            const existingConversation = previous[existingIndex];
            const nextConversation = {
              ...existingConversation,
              lastMessage: incoming.body,
              lastMessageAt: incoming.created_at,
              unread_count: 0,
              unread: false,
            };

            const remaining = previous.filter((conversation) => conversation.id !== incoming.conversation_id);
            return [nextConversation, ...remaining];
          });

          void markConversationRead(incoming.conversation_id);
          return;
        }

        setConversations((previous) => {
          const existingIndex = previous.findIndex((conversation) => conversation.id === incoming.conversation_id);
          if (existingIndex < 0) {
            return previous;
          }

          const existingConversation = previous[existingIndex];
          const nextConversation = {
            ...existingConversation,
            lastMessage: incoming.body,
            lastMessageAt: incoming.created_at,
            unread_count: existingConversation.unread_count + 1,
            unread: true,
          };

          const remaining = previous.filter((conversation) => conversation.id !== incoming.conversation_id);
          return [nextConversation, ...remaining];
        });

        void refreshUnreadCounts(incoming.conversation_id);
        void refreshConversations();
      }
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, markConversationRead, refreshConversations, refreshUnreadCounts]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#07070B] px-6 py-6 text-white">
        <div className="mx-auto flex max-w-4xl items-center justify-center rounded-3xl border border-white/10 bg-white/5 p-12 text-white/70">
          Checking authentication...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#07070B] px-6 py-6 text-white">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[.4fr_1fr]">
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">💬 Messages</h1>
            <span className="rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-violet-200">
              Direct
            </span>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-white/60">New Message</h2>
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => searchProfiles(event.target.value)}
              placeholder="Search by name or username"
              className="mt-3 w-full rounded-2xl border border-white/10 bg-[#07070B] px-4 py-3 text-white outline-none focus:border-violet-400"
            />

            {searchingProfiles ? (
              <p className="mt-3 text-sm text-white/60">Searching profiles...</p>
            ) : null}

            {searchError ? (
              <p className="mt-3 text-sm text-rose-300">{searchError}</p>
            ) : null}

            <div className="mt-3 space-y-2">
              {searchResults.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => void handleStartConversation(profile.id)}
                  disabled={startingConversation}
                  className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-[#07070B] px-3 py-3 text-left transition hover:border-violet-400/40 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/10 text-sm font-semibold text-white/70">
                    {profile.avatar_url ? (
                      <img src={profile.avatar_url} alt={profile.display_name || profile.username || "Profile avatar"} className="h-full w-full object-cover" />
                    ) : (
                      (profile.display_name || profile.username || "U").charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-white">
                      {profile.display_name || profile.username || "Unnamed profile"}
                    </p>
                    {profile.username ? <p className="truncate text-sm text-white/60">@{profile.username}</p> : null}
                  </div>
                </button>
              ))}
            </div>

            {!searchingProfiles && !searchError && !searchTerm.trim() ? (
              <p className="mt-3 text-sm text-white/60">Search for a profile to start a new conversation.</p>
            ) : null}

            {startingConversation ? (
              <p className="mt-3 text-sm text-violet-200">Opening conversation...</p>
            ) : null}
          </div>

          <div className="space-y-2">
            {conversationError ? (
              <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-200">
                {conversationError}
              </div>
            ) : null}

            {conversations.length === 0 && !loading ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
                No conversations yet. Search for someone to begin messaging.
              </div>
            ) : null}

            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => void handleSelectConversation(conversation.id)}
                className={`block w-full rounded-2xl border p-4 text-left transition ${
                  selectedConversationId === conversation.id
                    ? conversation.unread
                      ? "border-violet-400/50 bg-violet-500/15"
                      : "border-violet-400/40 bg-violet-500/10"
                    : conversation.unread
                      ? "border-violet-500/30 bg-violet-500/10"
                      : "border-white/10 bg-white/5"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-[#07070B] text-sm font-semibold text-white/80">
                      {conversation.avatarUrl ? (
                        <img src={conversation.avatarUrl} alt={conversation.name} className="h-full w-full object-cover" />
                      ) : (
                        conversation.name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-white">{conversation.name}</h3>
                      <p className="truncate text-sm text-white/60">
                        {conversation.lastMessage || "Start the conversation"}
                      </p>
                    </div>
                  </div>
                  {conversation.unread_count > 0 ? (
                    <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-violet-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                      {conversation.unread_count}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-white/50">
                  <span>{conversation.lastMessageAt ? formatMessageTime(conversation.lastMessageAt) : ""}</span>
                  {conversation.unread ? <span className="font-semibold text-violet-200">Unread</span> : null}
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-6">
          {selectedConversation ? (
            <>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-[#07070B] text-sm font-semibold text-white/80">
                    {selectedConversation.avatarUrl ? (
                      <img src={selectedConversation.avatarUrl} alt={selectedConversation.name} className="h-full w-full object-cover" />
                    ) : (
                      selectedConversation.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white">{selectedConversation.name}</h2>
                    <p className="text-sm text-white/60">Direct messages</p>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
                {messagesLoading ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-white/60">
                    Loading messages...
                  </div>
                ) : messages.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-white/60">
                    No messages yet. Say hello to start the conversation.
                  </div>
                ) : (
                  <div className="max-h-[420px] space-y-3 overflow-y-auto pr-2">
                    {messages.map((message) => {
                      const isMine = message.sender_id === currentUserId;
                      return (
                        <div
                          key={message.id}
                          className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                              isMine
                                ? "bg-violet-600/20 text-white"
                                : "bg-white/10 text-white"
                            }`}
                          >
                            <p className="whitespace-pre-wrap text-sm">{message.body}</p>
                            <p className="mt-2 text-[11px] uppercase tracking-[0.2em] text-white/50">
                              {formatMessageTime(message.created_at)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-violet-400/20 bg-violet-500/10 p-6">
                {notice ? (
                  <div className="mb-4 rounded-2xl border border-white/10 bg-[#07070B]/50 p-3 text-sm text-violet-100">
                    {notice}
                  </div>
                ) : null}

                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Type your message..."
                  className="min-h-[100px] w-full rounded-2xl border border-white/10 bg-[#07070B] px-4 py-3 text-white outline-none focus:border-violet-400"
                />
                <button
                  type="button"
                  onClick={() => void handleSendMessage()}
                  disabled={sending || !draft.trim()}
                  className="mt-4 w-full rounded-full bg-violet-600 px-4 py-3 font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sending ? "Sending..." : "Send Message"}
                </button>
              </div>
            </>
          ) : (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white/60">
              Select a conversation to start chatting.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default function MessagesPage() {
  return (
    <AuthGuard>
      <MessagesPageContent />
    </AuthGuard>
  );
}
