import { useParams, Link } from 'react-router-dom';
import { useAppState } from '@/domain/store/hooks';
import { Logo, Card, StatusBadge, Progress, Callout, SimTag } from '@/app/shared/ui';
import { FleetMap } from '@/app/shared/map/FleetMap';
import { fmtTime } from '@/domain/util';

/** Public live-trip view for trusted contacts (no personal passenger data beyond the trip). */
export default function ShareTripPage() {
  const { token } = useParams();
  const state = useAppState((s) => s);
  const trip = Object.values(state.trips).find((t) => t.shareToken === token);
  return (
    <div className="mx-auto max-w-md p-4 space-y-4">
      <Link to="/"><Logo size={30} tagline /></Link>
      {!trip ? <Callout tone="warn" title="Link not found">This live trip link is invalid or has expired.</Callout> : (
        <>
          <Card title="Live trip" subtitle={`${state.stations[trip.stationId].name} → ${state.hotspots[trip.hotspotId].name}`} action={<StatusBadge status={trip.status} />}>
            <div className="text-sm">Vehicle <b>{trip.vehicleId}</b> · {state.vehicles[trip.vehicleId].registration} · Driver {state.users[trip.driverId].name}</div>
            {trip.etaAt && <div className="text-xs text-slate-500">ETA {fmtTime(trip.etaAt)}</div>}
            <Progress value={trip.progress * 100} className="mt-2" tone="green" />
            <div className="mt-2"><SimTag>Simulated GPS</SimTag></div>
          </Card>
          <FleetMap height={320} vehicles={[state.vehicles[trip.vehicleId]]} trips={[trip]} stations={[state.stations[trip.stationId]]} hotspots={[state.hotspots[trip.hotspotId]]} focusTripId={trip.id} />
        </>
      )}
    </div>
  );
}
