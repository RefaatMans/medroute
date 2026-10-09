import { useEffect } from 'react';
import L from 'leaflet';
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { MAP_CENTER, MAP_ZOOM } from '../../config/demoLocations';
import type { LatLng } from '../../types';

// Vite bundles Leaflet's default marker images under hashed names; point Leaflet at them.
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow });

export interface HospitalMarker {
  id: string;
  position: LatLng;
  color: string;
  /** Shown in the tooltip; first line is the name. */
  label: string;
  detail?: string;
  /** Bigger marker with a permanent label (e.g. the #1 recommendation). */
  highlight?: boolean;
}

export interface AmbulanceMarker {
  id: string;
  position: LatLng;
  label: string;
  /** Visual state: the paramedic's own unit, idle, or en route. */
  variant?: 'self' | 'idle' | 'en_route';
}

export interface MapLine {
  id: string;
  from: LatLng;
  to: LatLng;
  color?: string;
}

interface Props {
  hospitals?: HospitalMarker[];
  ambulances?: AmbulanceMarker[];
  lines?: MapLine[];
  onMapClick?: (p: LatLng) => void;
  /** When this changes, the map zooms to fit all markers. */
  fitKey?: string;
  className?: string;
}

const AMBULANCE_STYLE = {
  self: 'background:#b91c1c;color:#fff;',
  en_route: 'background:#1d4ed8;color:#fff;',
  idle: 'background:#fff;color:#0f172a;border:2px solid #0f172a;',
};

function ambulanceIcon(label: string, variant: NonNullable<AmbulanceMarker['variant']>) {
  return L.divIcon({
    className: '',
    html: `<div style="${AMBULANCE_STYLE[variant]}border-radius:9999px;padding:2px 6px;font:600 12px system-ui;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.4);transform:translate(-50%,-50%);display:inline-block">🚑 ${label}</div>`,
    iconSize: [0, 0],
  });
}

function ClickHandler({ onClick }: { onClick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onClick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

function FitBounds({ points, fitKey }: { points: LatLng[]; fitKey?: string }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) map.setView(points[0], Math.max(map.getZoom(), 13));
    else map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [30, 30], maxZoom: 15 });
    // Only refit when the caller says so, not on every live update.
  }, [fitKey, map]);
  return null;
}

/** Leaflet + OpenStreetMap map of hospitals, ambulances and route lines. */
export default function HospitalMap({ hospitals = [], ambulances = [], lines = [], onMapClick, fitKey, className = 'h-72' }: Props) {
  const points = [...hospitals.map((h) => h.position), ...ambulances.map((a) => a.position)];
  return (
    <div className={`overflow-hidden rounded-lg border border-slate-200 ${className}`}>
      <MapContainer center={MAP_CENTER} zoom={MAP_ZOOM} className="h-full w-full" scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {onMapClick && <ClickHandler onClick={onMapClick} />}
        <FitBounds points={points} fitKey={fitKey} />
        {lines.map((l) => (
          <Polyline key={l.id} positions={[l.from, l.to]} pathOptions={{ color: l.color ?? '#1d4ed8', weight: 3, dashArray: '6 6' }} />
        ))}
        {hospitals.map((h) => (
          <CircleMarker
            key={h.id}
            center={h.position}
            radius={h.highlight ? 13 : 9}
            pathOptions={{ color: '#fff', weight: 2, fillColor: h.color, fillOpacity: 1 }}
          >
            <Tooltip direction="top" offset={[0, -8]} permanent={h.highlight}>
              <strong>{h.label}</strong>
              {h.detail && <div>{h.detail}</div>}
            </Tooltip>
          </CircleMarker>
        ))}
        {ambulances.map((a) => (
          <Marker key={a.id} position={a.position} icon={ambulanceIcon(a.label, a.variant ?? 'idle')} keyboard={false} />
        ))}
      </MapContainer>
    </div>
  );
}
