import { useCallback, useEffect, useRef } from 'react';

/**
 * Short alert beep via Web Audio. Browsers only allow sound after the user has interacted
 * with the page, so the audio context is created on the first click / key press.
 */
export function useBeep(): () => boolean {
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const unlock = () => {
      ctxRef.current ??= new AudioContext();
      void ctxRef.current.resume();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      void ctxRef.current?.close();
      ctxRef.current = null;
    };
  }, []);

  return useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || ctx.state !== 'running') return false;
    // Two short tones.
    [0, 0.22].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.25, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.2);
    });
    return true;
  }, []);
}
