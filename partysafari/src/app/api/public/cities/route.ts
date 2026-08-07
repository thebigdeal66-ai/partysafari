import { NextRequest, NextResponse } from "next/server";

type NominatimAddress = Record<string, string | undefined>;

type NominatimResult = {
  lat?: string;
  lon?: string;
  name?: string;
  display_name?: string;
  address?: NominatimAddress;
};

function cityName(result: NominatimResult) {
  const address = result.address || {};
  return (
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.hamlet ||
    result.name ||
    null
  );
}

function stateLabel(result: NominatimResult) {
  const address = result.address || {};
  const isoState = address["ISO3166-2-lvl4"] || address["ISO3166-2-lvl3"];
  if (isoState?.startsWith("US-")) {
    return isoState.slice(3);
  }
  return address.state || null;
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() || "";

  if (query.length < 2 || query.length > 100) {
    return NextResponse.json({ error: "Enter a city and state." }, { status: 400 });
  }

  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    addressdetails: "1",
    countrycodes: "us",
    featureType: "city",
    limit: "5",
  });

  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: {
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": "PartySafari/1.0 (https://partysafari.live)",
      },
      next: { revalidate: 86400 },
    });

    if (!response.ok) {
      throw new Error(`Geocoder returned ${response.status}`);
    }

    const raw = (await response.json()) as NominatimResult[];
    const results = raw
      .map((result) => {
        const lat = Number(result.lat);
        const lng = Number(result.lon);
        const city = cityName(result);
        const state = stateLabel(result);

        if (!city || !Number.isFinite(lat) || !Number.isFinite(lng)) {
          return null;
        }

        return {
          label: state ? `${city}, ${state}` : city,
          city,
          state,
          lat,
          lng,
        };
      })
      .filter((result): result is NonNullable<typeof result> => Boolean(result));

    return NextResponse.json(results);
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[RadarCitySearch] geocoding failed", error);
    }
    return NextResponse.json({ error: "City search is temporarily unavailable." }, { status: 502 });
  }
}
