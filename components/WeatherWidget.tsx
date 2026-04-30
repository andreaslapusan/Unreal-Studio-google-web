/**
 * Tiny weather widget. Open-Meteo, no key required, free tier.
 * Caches in sessionStorage for 1h so we don't hit the API on every nav.
 */
import React, { useEffect, useState } from "react";

interface Weather {
  tempC: number;
  code: number;
  windKmh: number;
  fetchedAt: number;
}

// Bali centroid (Denpasar). Adjust if you want per-project coords later.
const BALI_LAT = -8.65;
const BALI_LON = 115.22;

const CODE_LABEL: Record<number, string> = {
  0: "Despejado",
  1: "Mayormente despejado",
  2: "Parcialmente nublado",
  3: "Nublado",
  45: "Niebla",
  48: "Niebla densa",
  51: "Llovizna",
  61: "Lluvia",
  63: "Lluvia",
  65: "Lluvia fuerte",
  80: "Chubascos",
  95: "Tormenta",
};

const CODE_EMOJI: Record<number, string> = {
  0: "☀️", 1: "🌤", 2: "⛅", 3: "☁️", 45: "🌫", 48: "🌫",
  51: "🌦", 61: "🌧", 63: "🌧", 65: "🌧", 80: "🌧", 95: "⛈",
};

const KEY = "_unreal_weather_bali";
const TTL_MS = 60 * 60 * 1000;

export default function WeatherWidget() {
  const [w, setW] = useState<Weather | null>(null);

  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as Weather;
        if (Date.now() - parsed.fetchedAt < TTL_MS) {
          setW(parsed);
          return;
        }
      }
    } catch {
      // ignore
    }

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${BALI_LAT}&longitude=${BALI_LON}&current=temperature_2m,weather_code,wind_speed_10m&timezone=Asia%2FMakassar`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        const cur = data?.current;
        if (!cur) return;
        const next: Weather = {
          tempC: Math.round(cur.temperature_2m),
          code: cur.weather_code,
          windKmh: Math.round(cur.wind_speed_10m),
          fetchedAt: Date.now(),
        };
        setW(next);
        try { sessionStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
      })
      .catch(() => { /* offline / api down → hide widget */ });
  }, []);

  if (!w) return null;
  const label = CODE_LABEL[w.code] ?? "—";
  const emoji = CODE_EMOJI[w.code] ?? "🌡";

  return (
    <div className="bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-xl p-4 flex items-center gap-4">
      <span className="text-3xl">{emoji}</span>
      <div>
        <p className="text-xs uppercase tracking-widest text-amber-900/60">Hoy en Bali</p>
        <p className="text-amber-900 font-bold">
          {w.tempC}°C · {label}
          <span className="ml-2 text-xs font-normal opacity-70">viento {w.windKmh} km/h</span>
        </p>
      </div>
    </div>
  );
}

export function getWeatherSummary(): string | null {
  try {
    const cached = sessionStorage.getItem(KEY);
    if (!cached) return null;
    const parsed = JSON.parse(cached) as Weather;
    if (Date.now() - parsed.fetchedAt > TTL_MS) return null;
    return `${parsed.tempC}°C ${CODE_LABEL[parsed.code] ?? ""}`.trim();
  } catch {
    return null;
  }
}
