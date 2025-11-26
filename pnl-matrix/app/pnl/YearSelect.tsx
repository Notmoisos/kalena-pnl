'use client';
import { useRouter, useSearchParams } from 'next/navigation';

export default function YearSelect() {
  const router = useRouter();
  const params = useSearchParams();
  const year = Number(params.get('year')) || new Date().getFullYear();

  const handle = (y: number) => {
    router.push(`/pnl?year=${y}`);
  };

  return (
    <div className="mb-4">
      <label className="mr-2 font-medium">Ano:</label>
      <select
        value={year}
        onChange={(e) => handle(Number(e.target.value))}
        className="border rounded px-2 py-1"
      >
        {Array.from({ length: 9 }, (_, i) => 2028 - i).map((y) => (
          <option key={y}>{y}</option>
        ))}
      </select>
    </div>
  );
} 