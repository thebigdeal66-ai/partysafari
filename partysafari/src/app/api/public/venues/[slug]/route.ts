export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return Response.json({ error: "Public venue data is unavailable." }, { status: 503 });
  }

  const endpoint = new URL("/rest/v1/venues", supabaseUrl);
  endpoint.searchParams.set("slug", `eq.${slug}`);
  endpoint.searchParams.set("select", "*");
  endpoint.searchParams.set("limit", "1");

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

    const rows = (await response.json()) as unknown[];
    if (rows.length === 0) {
      return Response.json({ error: "Venue not found." }, { status: 404 });
    }

    return Response.json(rows[0], {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "Venue lookup failed." }, { status: 502 });
  }
}
