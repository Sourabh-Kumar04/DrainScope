# DrainScope Web Studio (`apps/web`)

Next.js 15.5 + TypeScript + MapLibre GL + Deck.gl + Three.js + WebGL frontend.

## Environment Variables (`apps/web/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_MAPILLARY_TOKEN=MLY|your_mapillary_client_token
```

## Development & Production Build

```bash
cd apps/web
npm install
npm run lint
npm run build
npm run start
```

### Routes
* `/` — Project overview & entry
* `/workspace` — 3D catchment map, draped floodwater, live road streamlines, street-mapped micro-drain pins, WebGL Street Flood modal & 3D Shallow-Water Sandbox
* `/workspace/hotspots` — "Fix First" (`IPS`) ranked hotspot register + CSV/GeoJSON exports
* `/workspace/screener` — Batch site & portfolio screener (`1–100` coordinates)
* `/workspace/analytics` — Catchment statistics & NbS park detention summary
* `/methodology` — Transparent equations, data licenses, and limitations

## Troubleshooting Port 3000 (WSL2)

```bash
fuser -k 3000/tcp || pkill -f "next-server"
npm run start
```
