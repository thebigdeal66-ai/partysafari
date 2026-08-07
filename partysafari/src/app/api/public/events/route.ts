export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return Response.json({ error: "Public event data is unavailable." }, { status: 503 });
  }

  const endpoint = new URL("/rest/v1/events", supabaseUrl);
  const dayAheadIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  endpoint.searchParams.set(
    "select",
    "id,venue_id,title,performer_name,event_type,start_time,end_time,status"
  );
  endpoint.searchParams.append("start_time", `gte.${twoHoursAgo}`);
  endpoint.searchParams.append("start_time", `lte.${dayAheadIso}`);
  endpoint.searchParams.set("order", "start_time.asc");
  endpoint.searchParams.set("limit", "300");

  try {
    const response = await fetch(endpoint, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return Response.json({ error: "Event lookup failed." }, { status: 502 });
    }

    return Response.json(await response.json(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "Event lookup failed." }, { status: 502 });
  }
}
