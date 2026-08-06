"use client";

import { useMemo, useState } from "react";

type VenueMeetupActionsProps = {
  venueName: string;
  venueSlug: string;
  friendsHereCount: number;
};

export default function VenueMeetupActions({ venueName, venueSlug, friendsHereCount }: VenueMeetupActionsProps) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const venueUrl = useMemo(() => {
    if (typeof window === "undefined") return `/venues/${venueSlug}`;
    return `${window.location.origin}/venues/${venueSlug}`;
  }, [venueSlug]);

  async function shareMeetup() {
    const text = `Meet me at ${venueName} tonight on PartySafari.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `Meet at ${venueName}`, text, url: venueUrl });
        setFeedback("Invite sent");
      } else {
        await navigator.clipboard.writeText(`${text} ${venueUrl}`);
        setFeedback("Meetup link copied");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setFeedback("Could not share yet");
    }

    window.setTimeout(() => setFeedback(null), 2400);
  }

  return (
    <section className="rounded-2xl border border-fuchsia-300/20 bg-fuchsia-400/8 p-3" aria-label={`${venueName} meetup options`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fuchsia-100/70">Meetup</p>
          <p className="mt-0.5 text-xs text-white/60">
            {friendsHereCount > 0
              ? `${friendsHereCount} ${friendsHereCount === 1 ? "friend is" : "friends are"} near this venue`
              : "Invite your group to meet here"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void shareMeetup()}
          className="rounded-full border border-fuchsia-200/35 bg-fuchsia-400/15 px-3 py-1.5 text-xs font-semibold text-fuchsia-50 transition hover:bg-fuchsia-400/25"
        >
          Meet me here
        </button>
      </div>
      {feedback ? <p className="mt-2 text-[11px] font-medium text-fuchsia-100/80" role="status">{feedback}</p> : null}
    </section>
  );
}
