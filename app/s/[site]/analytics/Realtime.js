'use client';

import { useEffect, useState } from 'react';
import { realtimeCount } from './actions';

export default function Realtime({ site, initial }) {
  const [n, setN] = useState(initial);
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) realtimeCount(site).then(setN).catch(() => {}); }, 30000);
    return () => clearInterval(id);
  }, [site]);
  return (
    <p className="flex items-center gap-2 text-sm" role="status">
      <span aria-hidden="true" className={`size-2 rounded-full ${n ? 'bg-success' : 'bg-line'}`} />
      <b className="tabular-nums">{n}</b> pengunjung dalam 5 menit terakhir
    </p>
  );
}
