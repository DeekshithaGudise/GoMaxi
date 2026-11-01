import { Suspense, lazy, type ReactNode } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useSession } from '@/app/session';
import type { Role } from '@/domain/types';
import { LoginPage } from '@/app/auth/LoginPage';
import { Skeleton } from '@/app/shared/ui';

const CommuterApp = lazy(() => import('@/app/commuter/CommuterApp'));
const DriverApp = lazy(() => import('@/app/driver/DriverApp'));
const AdminApp = lazy(() => import('@/app/admin/AdminApp'));
const DemoApp = lazy(() => import('@/app/demo/DemoApp'));
const ShareTripPage = lazy(() => import('@/app/commuter/ShareTripPage'));

function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { session } = useSession();
  const loc = useLocation();
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (!roles.includes(session.role)) return <Navigate to={`/${session.role === 'metro' ? 'metro' : session.role}`} replace />;
  return <>{children}</>;
}

const Loading = () => <div className="mx-auto max-w-md p-6 space-y-3"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-40" /><Skeleton className="h-24" /></div>;

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/share/:token" element={<ShareTripPage />} />
        <Route path="/demo/*" element={<DemoApp />} />
        <Route path="/commuter/*" element={<RequireRole roles={['commuter']}><CommuterApp /></RequireRole>} />
        <Route path="/driver/*" element={<RequireRole roles={['driver']}><DriverApp /></RequireRole>} />
        <Route path="/admin/*" element={<RequireRole roles={['admin']}><AdminApp mode="admin" /></RequireRole>} />
        <Route path="/metro/*" element={<RequireRole roles={['metro']}><AdminApp mode="metro" /></RequireRole>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
