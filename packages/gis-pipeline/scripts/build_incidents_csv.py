"""Geocode documented South Delhi / Barapullah waterlogging hotspots via OSM Nominatim
using fallback queries so landmark names resolve reliably."""

import csv
import time
from pathlib import Path
import osmnx as ox

# Each entry: (Display Name, [primary_query, fallback_query, ...], Published Source)
HOTSPOTS = [
    ("Moolchand", ["Moolchand Metro Station, Delhi", "Moolchand, Delhi, India"], "Delhi Traffic Police (2025)"),
    ("Chirag Delhi", ["Chirag Dilli, Delhi, India", "Chirag Delhi Metro Station, Delhi"], "Delhi Traffic Police (2025)"),
    ("Defence Colony", ["Defence Colony, Delhi, India", "Defence Colony Market, Delhi"], "IIT Delhi Drainage Master Plan"),
    ("South Extension", ["South Extension, New Delhi, India", "South Extension, Delhi"], "IIT Delhi Drainage Master Plan"),
    ("Lajpat Nagar", ["Lajpat Nagar Flyover, New Delhi, India", "Lajpat Nagar, Delhi"], "Delhi Monsoon Reports (2023-2026)"),
    ("Savitri Cinema / GK", ["Savitri Cinema, Delhi", "Greater Kailash, Delhi, India"], "Delhi Traffic Police (2026) / IIT Delhi DMP"),
    ("Malviya Nagar Metro", ["Malviya Nagar Metro Station, Delhi", "Malviya Nagar, Delhi, India"], "Delhi Traffic Police (2026)"),
    ("Hazrat Nizamuddin", ["Hazrat Nizamuddin, Delhi, India", "Nizamuddin, Delhi"], "Delhi Traffic Police (2026)"),
    ("Okhla", ["Okhla Industrial Area, Delhi", "Okhla, Delhi, India"], "Delhi Traffic Police (2026)"),
    ("Kalkaji", ["Kalkaji, New Delhi, India", "Kalkaji Mandir, Delhi"], "IIT Delhi Drainage Master Plan"),
    ("AIIMS Flyover", ["AIIMS Flyover, New Delhi, India", "AIIMS, Delhi, India"], "Delhi Monsoon Hotspot Lists"),
    ("Safdarjung Hospital", ["Safdarjung Hospital, Delhi, India", "Safdarjung Enclave, Delhi"], "Delhi Monsoon Hotspot Lists"),
    ("Khanpur", ["Khanpur, Delhi, India", "Deoli, Delhi, India"], "Delhi Traffic Police (2026)"),
    ("Jamia Hamdard", ["Jamia Hamdard, Delhi, India", "Hamdard Nagar, Delhi"], "Delhi Traffic Police (2026)"),
    ("Batra Hospital", ["Batra Hospital, Delhi, India", "Tughlakabad Institutional Area, Delhi"], "Delhi Traffic Police (2026)"),
    ("Ashram Chowk", ["Ashram Chowk, Delhi, India", "Ashram Metro Station, Delhi"], "Delhi Traffic Police (2025)"),
    ("Andrews Ganj", ["Andrews Ganj, Delhi, India"], "Delhi Monsoon Hotspot Lists"),
    ("Nehru Place", ["Nehru Place, Delhi, India"], "IIT Delhi Drainage Master Plan"),
    ("Yusuf Sarai", ["Yusuf Sarai, Delhi, India"], "Delhi Monsoon Hotspot Lists"),
    ("Jangpura", ["Jangpura, Delhi, India"], "Delhi Monsoon Hotspot Lists"),
    ("Saket", ["Saket, New Delhi, India"], "Delhi Traffic Police (2025)"),
]

BBOX = (77.175, 28.515, 77.275, 28.595)  # min_lon, min_lat, max_lon, max_lat


def geocode_with_fallback(queries: list[str]) -> tuple[float, float, str] | None:
    for q in queries:
        try:
            lat, lon = ox.geocode(q)
            if BBOX[1] <= lat <= BBOX[3] and BBOX[0] <= lon <= BBOX[2]:
                return lat, lon, q
        except Exception:
            pass
        time.sleep(1.1)
    return None


def main() -> None:
    out_path = Path("data/raw/delhi_waterlogging_incidents.csv")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    rows = []
    for name, queries, source in HOTSPOTS:
        hit = geocode_with_fallback(queries)
        if hit:
            lat, lon, matched_q = hit
            rows.append({"name": name, "query": matched_q, "lat": round(lat, 6), "lon": round(lon, 6), "source": source})
            print(f"[OK] {name} -> ({lat:.5f}, {lon:.5f})")
        else:
            print(f"[SKIP] {name}")

    with out_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["name", "query", "lat", "lon", "source"])
        writer.writeheader()
        writer.writerows(rows)
    print(f"\nWrote {len(rows)} geocoded Barapullah hotspots -> {out_path}")


if __name__ == "__main__":
    main()
