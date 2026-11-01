import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, Legend } from 'recharts';
import type { ReactNode } from 'react';

export const PALETTE = ['#2563EB', '#20C4D8', '#16A36A', '#F59E0B', '#8B5CF6', '#E5484D', '#0EA5E9', '#64748B'];
const axis = { tick: { fontSize: 11, fill: '#64748B' }, axisLine: false as const, tickLine: false as const };
const grid = <CartesianGrid strokeDasharray="3 3" stroke="#E6ECF4" vertical={false} />;

export function Bars({ data, x, series, height = 220, stacked = false, format }: { data: Record<string, unknown>[]; x: string; series: { key: string; name?: string; color?: string }[]; height?: number; stacked?: boolean; format?: (v: number) => string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        {grid}<XAxis dataKey={x} {...axis} /><YAxis {...axis} tickFormatter={format} width={60} />
        <Tooltip formatter={(v: number) => (format ? format(v) : v)} cursor={{ fill: 'rgba(37,99,235,0.06)' }} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.name ?? s.key} fill={s.color ?? PALETTE[i]} radius={[6, 6, 0, 0]} stackId={stacked ? 'a' : undefined} maxBarSize={38} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}
export function Lines({ data, x, series, height = 220, format }: { data: Record<string, unknown>[]; x: string; series: { key: string; name?: string; color?: string; dashed?: boolean }[]; height?: number; format?: (v: number) => string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        {grid}<XAxis dataKey={x} {...axis} /><YAxis {...axis} tickFormatter={format} width={60} />
        <Tooltip formatter={(v: number) => (format ? format(v) : v)} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {series.map((s, i) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.name ?? s.key} stroke={s.color ?? PALETTE[i]} strokeWidth={2.5} dot={false} strokeDasharray={s.dashed ? '5 5' : undefined} />)}
      </LineChart>
    </ResponsiveContainer>
  );
}
export function Areas({ data, x, series, height = 220, format }: { data: Record<string, unknown>[]; x: string; series: { key: string; name?: string; color?: string }[]; height?: number; format?: (v: number) => string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>{series.map((s, i) => <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={s.color ?? PALETTE[i]} stopOpacity={0.35} /><stop offset="100%" stopColor={s.color ?? PALETTE[i]} stopOpacity={0.02} /></linearGradient>)}</defs>
        {grid}<XAxis dataKey={x} {...axis} /><YAxis {...axis} tickFormatter={format} width={60} />
        <Tooltip formatter={(v: number) => (format ? format(v) : v)} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {series.map((s, i) => <Area key={s.key} type="monotone" dataKey={s.key} name={s.name ?? s.key} stroke={s.color ?? PALETTE[i]} strokeWidth={2.5} fill={`url(#g-${s.key})`} />)}
      </AreaChart>
    </ResponsiveContainer>
  );
}
export function Donut({ data, height = 220, format, center }: { data: { name: string; value: number; color?: string }[]; height?: number; format?: (v: number) => string; center?: ReactNode }) {
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="88%" paddingAngle={2} stroke="none">{data.map((d, i) => <Cell key={d.name} fill={d.color ?? PALETTE[i % PALETTE.length]} />)}</Pie>
          <Tooltip formatter={(v: number) => (format ? format(v) : v)} />
          <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
        </PieChart>
      </ResponsiveContainer>
      {center && <div className="pointer-events-none absolute inset-x-0 top-[38%] text-center">{center}</div>}
    </div>
  );
}
