"use client";

import { useEffect, useState } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type Coordinates = {
  lat: number;
  lng: number;
};

type SafariMapStop = {
  venue: {
    latitude: number;
    longitude: number;
    name: string;
  };
};

type SafariRouteMapProps = {
  startPoint: Coordinates;
  stops: SafariMapStop[];
  activeStopIndex: number;
  highlightedStopIndex: number;
  isSafariStarted: boolean;
  prefersReducedMotion: boolean;
  revealSeed: number;
  onMarkerSelect?: (index: number) => void;
};

function buildMarkerIcon(index: number, active: boolean) {
  return L.divIcon({
    className: "safari-map-marker",
    html: `<div style="height:30px;width:30px;border-radius:9999px;display:flex;align-items:center;justify-content:center;font-weight:700;background:${
      active ? "#f97316" : "#7c3aed"
    };color:white;border:2px solid rgba(255,255,255,0.9);box-shadow:0 6px 14px rgba(0,0,0,0.35);">${index + 1}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -30],
  });
}

function MapAutoBounds({ points }: { points: Coordinates[] }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) {
      return;
    }

    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 13, { animate: true });
      return;
    }

    const bounds = L.latLngBounds(points.map((point) => [point.lat, point.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [30, 30], animate: true });
  }, [map, points]);

  return null;
}

export default function SafariRouteMap({
  startPoint,
  stops,
  activeStopIndex,
  highlightedStopIndex,
  isSafariStarted,
  prefersReducedMotion,
  revealSeed,
  onMarkerSelect,
}: SafariRouteMapProps) {
  const routePoints = stops.map((stop) => ({ lat: stop.venue.latitude, lng: stop.venue.longitude }));
  const pointsForBounds = routePoints.length > 0 ? routePoints : [startPoint];
  const [visibleMarkerCount, setVisibleMarkerCount] = useState(0);
  const [showRouteLine, setShowRouteLine] = useState(false);

  useEffect(() => {
    if (routePoints.length === 0) {
      setVisibleMarkerCount(0);
      setShowRouteLine(false);
      return;
    }

    if (prefersReducedMotion) {
      setVisibleMarkerCount(routePoints.length);
      setShowRouteLine(routePoints.length > 1);
      return;
    }

    setVisibleMarkerCount(1);
    setShowRouteLine(false);
    let current = 1;
    let lineTimeoutId: number | null = null;
    const intervalId = window.setInterval(() => {
      current += 1;
      setVisibleMarkerCount((previous) => Math.min(routePoints.length, Math.max(previous, current)));
      if (current >= routePoints.length) {
        window.clearInterval(intervalId);
        lineTimeoutId = window.setTimeout(() => {
          setShowRouteLine(routePoints.length > 1);
        }, 120);
      }
    }, 180);

    return () => {
      window.clearInterval(intervalId);
      if (lineTimeoutId !== null) {
        window.clearTimeout(lineTimeoutId);
      }
    };
  }, [prefersReducedMotion, revealSeed, routePoints.length]);

  return (
    <MapContainer center={[startPoint.lat, startPoint.lng]} zoom={13} className="h-full w-full" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapAutoBounds points={pointsForBounds} />
      {routePoints.length > 1 && showRouteLine ? (
        <Polyline
          positions={routePoints.map((point) => [point.lat, point.lng] as [number, number])}
          pathOptions={{ color: "#a855f7", weight: 4, opacity: 0.85 }}
        />
      ) : null}
      {routePoints.map((point, index) => {
        if (index >= visibleMarkerCount) {
          return null;
        }

        const highlighted = (isSafariStarted && index === activeStopIndex) || index === highlightedStopIndex;

        return (
          <Marker
            key={`${point.lat}-${point.lng}-${index}`}
            position={[point.lat, point.lng]}
            icon={buildMarkerIcon(index, highlighted)}
            eventHandlers={{
              click: () => {
                onMarkerSelect?.(index);
              },
            }}
          >
            <Popup>{stops[index].venue.name}</Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
