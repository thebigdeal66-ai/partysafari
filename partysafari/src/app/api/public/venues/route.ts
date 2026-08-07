export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return Response.json({ error: "Public venue data is unavailable." }, { status: 503 });
  }

  const endpoint = new URL("/rest/v1/venues", supabaseUrl);
  endpoint.searchParams.set(
    "select",
    "id,slug,name,city,state,venue_type,latitude,longitude,image_url,photo_url,current_status,music_genres,drink_specials,food_available"
  );
  endpoint.searchParams.set("latitude", "not.is.null");
  endpoint.searchParams.set("longitude", "not.is.null");
  endpoint.searchParams.set("limit", "260");

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
      return Response.json({ error: "Venue lookup failed." }, { status: 502 });
    }

    return Response.json(await response.json(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "Venue lookup failed." }, { status: 502 });
  }
}
