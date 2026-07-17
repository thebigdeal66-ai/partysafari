"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

export default function RequestPage() {
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);


  const [eventType, setEventType] = useState("");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [talentType, setTalentType] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  async function submitRequest() {
    setLoading(true);

    const { error } = await supabase.from("requests").insert({
      event_type: eventType,
      event_date: date,
      location,
      talent_type: talentType,
      notes,
    });

    setLoading(false);

    if (error) {
      alert("Error submitting request");
      console.error(error);
      return;
    }

    alert("Talent request submitted!");
    setEventType("");
    setDate("");
    setLocation("");
    setTalentType("");
    setNotes("");
  }

  return (
    <main className="min-h-screen bg-[#07070B] text-white px-6 py-10 flex justify-center">
      <div className="w-full max-w-xl space-y-4">
        <h1 className="text-3xl font-semibold">Post a Talent Request</h1>
        <p className="text-white/70">Tell PartySafari what kind of entertainment you need.</p>

        <input
          placeholder="Event Type"
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
          className="w-full p-3 rounded bg-white text-black"
        />

        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full p-3 rounded bg-white text-black"
        />

        <input
          placeholder="Location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="w-full p-3 rounded bg-white text-black"
        />

        <input
          placeholder="Talent Type"
          value={talentType}
          onChange={(e) => setTalentType(e.target.value)}
          className="w-full p-3 rounded bg-white text-black"
        />

        <textarea
          placeholder="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full p-3 rounded bg-white text-black min-h-[140px]"
        />

        <button
          onClick={submitRequest}
          disabled={loading}
          className="w-full bg-violet-600 p-3 rounded"
        >
          {loading ? "Submitting..." : "Submit Request"}
        </button>
      </div>
    </main>
  );
}
