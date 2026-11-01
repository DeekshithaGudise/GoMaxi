import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { LatLng, Vehicle, Trip, Station, Hotspot } from '@/domain/types';
import { useAppState } from '@/domain/store/hooks';
import { fareRule } from '@/domain/seed/geo';

const TILE = (import.meta.env.VITE_MAP_TILE_URL as string | undefined) || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

function vehicleIcon(v: Vehicle, highlight = false) {
  const color = v.status === 'on_trip' ? '#2563EB' : v.status === 'boarding' || v.status === 'assigned' ? '#20C4D8' : v.status === 'returning' ? '#8B5CF6' : v.status === 'idle' ? '#16A36A' : '#94A3B8';
  const html = `<div style="position:relative;width:34px;height:34px;transform:rotate(${Math.round(v.heading)}deg)">${highlight ? '<div style="position:absolute;inset:-6px;border-radius:50%;border:2px solid #2563EB;opacity:.6;animation:pulse-ring 1.6s infinite"></div>' : ''}<svg viewBox="0 0 34 34" width="34" height="34"><circle cx="17" cy="17" r="13" fill="${color}" stroke="white" stroke-width="3"/><path d="M17 8l5 10h-10z" fill="white"/></svg></div><div style="position:absolute;top:34px;left:50%;transform:translateX(-50%);white-space:nowrap;font:700 10px Inter,sans-serif;color:#10243A;background:rgba(255,255,255,.9);padding:1px 5px;border-radius:6px;border:1px solid #E6ECF4">${v.id}</div>`;
  return L.divIcon({ html, className: 'vehicle-marker', iconSize: [34, 34], iconAnchor: [17, 17] });
}
const stationIcon = L.divIcon({ html: `<div style="width:26px;height:26px;border-radius:8px;background:#10243A;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;color:#20C4D8;font:800 12px Inter">M</div>`, className: 'vehicle-marker', iconSize: [26, 26], iconAnchor: [13, 13] });

function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap();
  const key = points.map((p) => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`).join('|');
  useEffect(() => { if (points.length) map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [30, 30], maxZoom: 14 }); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export interface FleetMapProps {
  vehicles?: Vehicle[]; trips?: Trip[]; stations?: Station[]; hotspots?: Hotspot[]; focusTripId?: string; height?: string | number; showRoutes?: boolean; onVehicleClick?: (v: Vehicle) => void; className?: string; fit?: boolean; center?: LatLng; zoom?: number;
}
export function FleetMap({ vehicles = [], trips = [], stations = [], hotspots = [], focusTripId, height = 420, showRoutes = true, onVehicleClick, className = '', fit = true, center, zoom = 12 }: FleetMapProps) {
  const users = useAppState((s) => s.users);
  const stationsAll = useAppState((s) => s.stations);
  const hotspotsAll = useAppState((s) => s.hotspots);
  const points = useMemo(() => [...stations.map((s) => s.position), ...hotspots.map((h) => h.position), ...vehicles.map((v) => v.position)], [stations, hotspots, vehicles]);
  const c = center ?? { lat: 12.975, lng: 77.67 };
  return (
    <div className={`overflow-hidden rounded-2xl border border-mist-200 ${className}`} style={{ height }}>
      <MapContainer center={[c.lat, c.lng]} zoom={zoom} scrollWheelZoom className="h-full w-full" attributionControl>
        <TileLayer url={TILE} attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
        {fit && points.length > 1 && <FitBounds points={points} />}
        {showRoutes && trips.filter((t) => ['boarding', 'en_route', 'assigned'].includes(t.status)).map((t) => {
          const rule = fareRule(t.stationId, t.hotspotId);
          const focus = t.id === focusTripId;
          return <Polyline key={t.id} positions={rule.waypoints.map((p) => [p.lat, p.lng])} pathOptions={{ color: focus ? '#2563EB' : t.deviationAlert ? '#E5484D' : '#20C4D8', weight: focus ? 5 : 3, opacity: focus ? 0.9 : 0.5, dashArray: t.status === 'en_route' ? undefined : '6 8' }} />;
        })}
        {stations.map((s) => <Marker key={s.id} position={[s.position.lat, s.position.lng]} icon={stationIcon}><Tooltip direction="top" offset={[0, -12]}>{s.name} Metro</Tooltip></Marker>)}
        {hotspots.map((h) => (
          <CircleMarker key={h.id} center={[h.position.lat, h.position.lng]} radius={9} pathOptions={{ color: '#fff', weight: 2, fillColor: h.type === 'residential' ? '#F59E0B' : '#2563EB', fillOpacity: 0.9 }}>
            <Tooltip direction="top" offset={[0, -8]} permanent={hotspots.length <= 3}>{h.name}</Tooltip>
          </CircleMarker>
        ))}
        {vehicles.map((v) => {
          const trip = trips.find((t) => t.vehicleId === v.id && ['assigned', 'boarding', 'en_route'].includes(t.status));
          return (
            <Marker key={v.id} position={[v.position.lat, v.position.lng]} icon={vehicleIcon(v, !!trip && trip.id === focusTripId)} eventHandlers={{ click: () => onVehicleClick?.(v) }}>
              <Popup>
                <div className="text-xs leading-5">
                  <div className="font-bold text-sm">{v.id} · {v.registration}</div>
                  <div>Driver: {v.driverId ? users[v.driverId]?.name : '—'}</div>
                  <div>Status: <b>{v.status.replace('_', ' ')}</b></div>
                  {trip && <><div>To: {hotspotsAll[trip.hotspotId]?.name}</div><div>Passengers: {trip.boardedBookingIds.length}/{trip.capacity} boarded · {trip.bookingIds.length} booked</div>{trip.etaAt && <div>ETA: {new Date(trip.etaAt + 19800000).toISOString().slice(11, 16)}</div>}</>}
                  {!trip && v.currentStationId && <div>At: {stationsAll[v.currentStationId]?.name}</div>}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
