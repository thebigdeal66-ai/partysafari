"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabaseClient";
import Link from "next/link";

type RequestRow = {
  id: string;
  event_type: string | null;
  event_date: string | null;
  location: string | null;
  talent_type: string | null;
  notes: string | null;
  created_at: string | null;
  status: string | null;
  created_by: string | null;
};

type ResponseRow = {
  id: string;
  request_id: string;
  performer_name: string | null;
  message: string | null;
  offer_amount: number | null;
  created_at: string | null;
  accepted: boolean | null;
  responder_id: string | null;
};

export default function RequestsPage() {
  const supabase = createSupabaseBrowser();

  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [responses, setResponses] = useState<ResponseRow[]>([]);

  const [message, setMessage] = useState("");
  const [offerAmount, setOfferAmount] = useState("");

  const [loading, setLoading] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentProfileType, setCurrentProfileType] = useState<string | null>(null);

  const selectedRequest = useMemo(
    () =>
      requests.find((request) => request.id === selectedRequestId) || null,
    [requests, selectedRequestId]
  );

  const acceptedResponse = useMemo(
    () => responses.find((response) => response.accepted),
    [responses]
  );

  const isSelectedRequestOwner = Boolean(
    selectedRequest && currentUserId && selectedRequest.created_by === currentUserId
  );

  const isCurrentUserEntertainer = currentProfileType === "entertainer";

  const hasCurrentUserResponded = Boolean(
    currentUserId &&
      responses.some((response) => response.responder_id === currentUserId)
  );

  const isAcceptedPerformer = Boolean(
    acceptedResponse?.responder_id &&
      currentUserId &&
      acceptedResponse.responder_id === currentUserId
  );

  const bookingChatTargetId =
    isSelectedRequestOwner && acceptedResponse?.responder_id !== currentUserId
      ? acceptedResponse?.responder_id || null
      : isAcceptedPerformer && selectedRequest?.created_by !== currentUserId
        ? selectedRequest?.created_by || null
        : null;

  useEffect(() => {
    loadRequests();
  }, []);

  useEffect(() => {
    if (selectedRequestId) {
      loadResponses(selectedRequestId);
    } else {
      setResponses([]);
    }
  }, [selectedRequestId]);

  async function loadRequests() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setCurrentUserId(user?.id || null);

    if (user?.id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("profile_type")
        .eq("id", user.id)
        .maybeSingle();
      setCurrentProfileType(profile?.profile_type || null);
    } else {
      setCurrentProfileType(null);
    }

    const { data, error } = await supabase
      .from("requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[requests] Load requests failed:", error);
      }
      setNotice("Could not load requests.");
      return;
    }

    const rows = ((data as RequestRow[]) || []).map((row) => ({
      ...row,
      status: row.status || "open",
    }));

    setRequests(rows);
  }

  async function loadResponses(requestId: string) {
    const { data, error } = await supabase
      .from("request_responses")
      .select("*")
      .eq("request_id", requestId)
      .order("created_at", { ascending: false });

    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[requests] Load responses failed:", error);
      }
      setResponses([]);
      return;
    }

    setResponses((data as ResponseRow[]) || []);
  }

  async function refreshAll(requestId?: string) {
    await loadRequests();

    if (requestId) {
      await loadResponses(requestId);
    }
  }

  function handleSelectRequest(requestId: string) {
    setNotice("");
    setSelectedRequestId(requestId);
  }

  async function handleSubmitResponse() {
    if (!selectedRequest) return;

    if (isSelectedRequestOwner) {
      setNotice("You can’t respond to your own request.");
      return;
    }

    if (!isCurrentUserEntertainer) {
      setNotice("Only Entertainer accounts can respond to talent requests.");
      return;
    }

    if (selectedRequest.status === "booked") {
      setNotice("This request is already booked.");
      return;
    }

    if (hasCurrentUserResponded) {
      setNotice("You’ve already responded to this request.");
      return;
    }

    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      setNotice("Please enter a message.");
      return;
    }

    if (trimmedMessage.length > 2000) {
      setNotice("Keep your response to 2,000 characters or fewer.");
      return;
    }

    const normalizedOfferAmount = offerAmount.trim();
    const parsedOfferAmount = normalizedOfferAmount
      ? Number(normalizedOfferAmount)
      : null;

    if (
      parsedOfferAmount !== null &&
      (!Number.isFinite(parsedOfferAmount) ||
        parsedOfferAmount < 0.01 ||
        parsedOfferAmount > 1000000 ||
        !/^\\d+(?:\\.\\d{1,2})?$/.test(normalizedOfferAmount))
    ) {
      setNotice("Enter a valid offer between $0.01 and $1,000,000.00.");
      return;
    }

    setLoading(true);

    const { error } = await supabase
      .from("request_responses")
      .insert({
        request_id: selectedRequest.id,
        message: trimmedMessage,
        offer_amount: parsedOfferAmount,
        accepted: false,
      });

    setLoading(false);

    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[requests] Insert response failed:", error);
      }
      if (error.code === "23505") {
        setNotice("You’ve already responded to this request.");
      } else if (error.code === "23514") {
        setNotice("Check your response and offer amount, then try again.");
      } else {
        setNotice("Error sending response.");
      }
      return;
    }

    setMessage("");
    setOfferAmount("");

    setNotice("Response sent.");

    await refreshAll(selectedRequest.id);
  }

  async function handleAcceptOffer(responseId: string) {
    if (!selectedRequest) return;

    setNotice("");
    setAcceptingId(responseId);

    const { error: acceptError } = await supabase.rpc("accept_offer", {
      p_response_id: responseId,
    });

    if (acceptError) {
      if (process.env.NODE_ENV === "development") {
        console.error("[requests] Accept offer failed:", acceptError);
      }
      setNotice("Could not accept offer.");
      setAcceptingId(null);
      return;
    }

    setNotice("Offer accepted. Request is now booked.");

    setAcceptingId(null);

    await refreshAll(selectedRequest.id);
  }

  return (
    <main className="min-h-screen bg-[#07070B] px-6 py-6 text-white">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.1fr_.9fr]">

        <section>
          <h1 className="mb-6 text-3xl font-bold">
            🔥 Talent Requests
          </h1>

          {requests.length === 0 ? (
            <p className="text-white/60">
              No requests yet.
            </p>
          ) : (
            <div className="space-y-4">

              {requests.map((request) => (
                <button
                  key={request.id}
                  type="button"
                  onClick={() => handleSelectRequest(request.id)}
                  className={`block w-full rounded-2xl border p-4 text-left transition ${
                    selectedRequestId === request.id
                      ? "border-violet-400/40 bg-violet-500/10"
                      : "border-white/10 bg-white/5"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">

                    <h2 className="text-xl font-semibold">
                      {request.event_type || "Event"}
                    </h2>

                    <span
                      className={`rounded px-3 py-1 text-xs font-medium ${
                        request.status === "booked"
                          ? "border border-green-500/30 bg-green-600/20 text-green-300"
                          : "border border-violet-500/30 bg-violet-600/20 text-violet-200"
                      }`}
                    >
                      {request.status === "booked"
                        ? "Booked"
                        : "Open"}
                    </span>

                  </div>

                  <p className="mt-2 text-white/70">
                    📍 {request.location || "Unknown location"}
                  </p>

                  <p className="text-white/70">
                    🎧 {request.talent_type || "Talent needed"}
                  </p>

                  {request.event_date && (
                    <p className="mt-1 text-sm text-white/60">
                      📅 {request.event_date}
                    </p>
                  )}

                  {request.notes && (
                    <p className="mt-3 text-sm text-white/50">
                      {request.notes}
                    </p>
                  )}

                  <div className="mt-4 inline-block rounded bg-violet-600 px-4 py-2 text-sm font-medium">
                    {isCurrentUserEntertainer ? "View & Respond" : "View Request"}
                  </div>

                </button>
              ))}

            </div>
          )}
        </section>

        <section className="space-y-6">

          {notice && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
              {notice}
            </div>
          )}

          {!selectedRequest ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/60">
              Select a request to view details and respond.
            </div>
          ) : (
            <>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">

                <div className="flex items-start justify-between gap-4">

                  <h2 className="text-2xl font-semibold">
                    {selectedRequest.event_type || "Event"}
                  </h2>

                  <span
                    className={`rounded px-3 py-1 text-xs font-medium ${
                      selectedRequest.status === "booked"
                        ? "border border-green-500/30 bg-green-600/20 text-green-300"
                        : "border border-violet-500/30 bg-violet-600/20 text-violet-200"
                    }`}
                  >
                    {selectedRequest.status === "booked"
                      ? "Booked"
                      : "Open"}
                  </span>

                </div>

                <div className="mt-4 space-y-2 text-white/75">
                  <p>
                    📍 {selectedRequest.location || "Unknown location"}
                  </p>

                  <p>
                    🎧 {selectedRequest.talent_type || "Talent needed"}
                  </p>

                  <p>
                    📅 {selectedRequest.event_date || "No date provided"}
                  </p>
                </div>

                {selectedRequest.notes && (
                  <div className="mt-4 rounded-xl bg-black/20 p-4 text-white/80">
                    {selectedRequest.notes}
                  </div>
                )}

                {selectedRequest.status === "booked" &&
                  acceptedResponse && (
                    <div className="mt-4 rounded-xl border border-green-500/30 bg-green-500/10 p-4">

                      <p className="font-semibold text-green-300">
                        ✅ Booking confirmed
                      </p>

                      <p className="mt-2 text-white/80">
                        Accepted performer:{" "}
                        <span className="font-medium">
                          {acceptedResponse.performer_name || "Performer"}
                        </span>
                      </p>

                    </div>
                  )}

                {selectedRequest.status === "booked" &&
                  bookingChatTargetId && (
                    <div className="mt-4">
                      <Link href={`/messages?start=${bookingChatTargetId}`}>
                        <button className="rounded bg-violet-600 px-4 py-2 text-sm font-medium">
                          Open Booking Chat
                        </button>
                      </Link>
                    </div>
                  )}

              </div>

              <div className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-6">

                <h3 className="text-xl font-semibold">
                  {isSelectedRequestOwner
                    ? "Your Request"
                    : isCurrentUserEntertainer
                      ? "Send a Response"
                      : "Entertainer Account Required"}
                </h3>

                {selectedRequest.status === "booked" ? (
                  <p className="mt-4 text-green-300">
                    This request is already booked.
                  </p>
                ) : isSelectedRequestOwner ? (
                  <p className="mt-4 text-white/70">
                    This is your request. Review performer responses below.
                  </p>
                ) : !currentUserId ? (
                  <div className="mt-4 space-y-3 text-white/70">
                    <p>Sign in with an Entertainer account to respond to this request.</p>
                    <Link href="/login" className="inline-flex rounded bg-violet-600 px-4 py-2 text-sm font-medium text-white">
                      Sign In
                    </Link>
                  </div>
                ) : !isCurrentUserEntertainer ? (
                  <div className="mt-4 space-y-3 text-white/70">
                    <p>Only Entertainer accounts can submit talent offers.</p>
                    <Link href="/profile/edit" className="inline-flex rounded bg-violet-600 px-4 py-2 text-sm font-medium text-white">
                      Update Profile Type
                    </Link>
                  </div>
                ) : hasCurrentUserResponded ? (
                  <div className="mt-4 rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-green-200">
                    Response submitted. The organizer can review your offer below.
                  </div>
                ) : (
                  <div className="mt-4 space-y-4">

                    <input
                      type="number"
                      inputMode="decimal"
                      min="0.01"
                      max="1000000"
                      step="0.01"
                      placeholder="Offer amount (optional)"
                      value={offerAmount}
                      onChange={(e) =>
                        setOfferAmount(e.target.value)
                      }
                      className="w-full rounded bg-white p-3 text-black"
                    />

                    <textarea
                      placeholder="Your pitch, availability, and details"
                      value={message}
                      maxLength={2000}
                      onChange={(e) =>
                        setMessage(e.target.value)
                      }
                      className="min-h-[140px] w-full rounded bg-white p-3 text-black"
                    />
                    <p className="text-right text-xs text-white/50">
                      {message.length}/2000
                    </p>

                    <button
                      onClick={handleSubmitResponse}
                      disabled={loading}
                      className="w-full rounded bg-violet-600 p-3 font-medium"
                    >
                      {loading
                        ? "Sending..."
                        : "Respond to Request"}
                    </button>

                  </div>
                )}

              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">

                <h3 className="mb-4 text-xl font-semibold">
                  Responses
                </h3>

                {responses.length === 0 ? (
                  <p className="text-white/60">
                    No responses yet.
                  </p>
                ) : (
                  <div className="space-y-4">

                    {responses.map((response) => (
                      <div
                        key={response.id}
                        className={`rounded-xl border p-4 ${
                          response.accepted
                            ? "border-green-500 bg-green-500/10"
                            : selectedRequest.status === "booked"
                            ? "border-white/10 bg-black/10 opacity-60"
                            : "border-white/10 bg-black/20"
                        }`}
                      >

                        <div className="flex items-center justify-between gap-4">

                          <h4 className="font-semibold">
                            {response.performer_name || "Performer"}
                          </h4>

                          <div className="flex items-center gap-2">

                            {response.offer_amount !== null && (
                              <span className="rounded bg-violet-600 px-3 py-1 text-sm">
                                ${response.offer_amount}
                              </span>
                            )}

                            {response.accepted && (
                              <span className="rounded bg-green-600 px-3 py-1 text-sm">
                                Accepted
                              </span>
                            )}

                          </div>

                        </div>

                        {response.message && (
                          <p className="mt-3 text-white/75">
                            {response.message}
                          </p>
                        )}

                        {isSelectedRequestOwner &&
                          !response.accepted &&
                          !acceptedResponse &&
                          selectedRequest.status !== "booked" && (
                            <button
                              onClick={() =>
                                handleAcceptOffer(response.id)
                              }
                              disabled={
                                acceptingId === response.id
                              }
                              className="mt-4 rounded bg-green-600 px-4 py-2 text-sm font-medium"
                            >
                              {acceptingId === response.id
                                ? "Accepting..."
                                : "Accept Offer"}
                            </button>
                          )}

                      </div>
                    ))}

                  </div>
                )}

              </div>

            </>
          )}

        </section>
      </div>
    </main>
  );
}