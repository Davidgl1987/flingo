import { useGameStore } from '../../stores/useGameStore';

export function EndModal() {
  const phase = useGameStore((state) => state.phase);
  const score = useGameStore((state) => state.score);
  const coins = useGameStore((state) => state.coins);
  const roomsCleared = useGameStore((state) => state.roomsCleared);
  const message = useGameStore((state) => state.message);
  const resetRun = useGameStore((state) => state.resetRun);

  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-slate-950/75 p-6">
      <section className="w-[min(520px,100%)] rounded-lg border border-white/15 bg-slate-950/95 p-5 text-slate-50 shadow-2xl shadow-black/50">
        <h1 className="m-0 text-2xl font-semibold">{phase === 'victory' ? 'MVP completado' : 'Game Over'}</h1>
        <p className="mb-3 mt-2 text-sm text-slate-300">{message}</p>
        <p className="mb-4 text-sm text-slate-300">Salas limpiadas: {roomsCleared} · Monedas: {coins} · Puntuación: {score}</p>
        <button className="rounded-lg border border-white/15 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-100" onClick={resetRun}>Jugar otra vez</button>
      </section>
    </div>
  );
}
