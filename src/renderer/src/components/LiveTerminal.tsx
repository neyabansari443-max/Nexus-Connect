import { useState, useEffect, useRef } from 'react';
import { Terminal, Copy } from 'lucide-react';

const DEFAULT_HEIGHT = 192;
const MIN_HEIGHT = 52;
const COLLAPSED_THRESHOLD = 64;
const MAX_TOP_GAP = 72;
const ACTIVITY_BLINK_MS = 2400;

export default function LiveTerminal() {
  const [logs, setLogs] = useState<string[]>([
    '[INIT] Nexus Connect Local Server Started',
    '[OK] UI Rendered and WebSockets Connected',
    '> Ready.'
  ]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [isBusyPulse, setIsBusyPulse] = useState(false);
  const [copied, setCopied] = useState(false);
  const isDragging = useRef(false);
  const busyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isCollapsed = height <= COLLAPSED_THRESHOLD;

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    if (window.api && window.api.onTerminalLog) {
      unsubscribe = window.api.onTerminalLog((_event, message) => {
        setLogs(prev => [...prev, message]);

        setIsBusyPulse(true);
        if (busyTimer.current) {
          clearTimeout(busyTimer.current);
        }
        busyTimer.current = setTimeout(() => {
          setIsBusyPulse(false);
        }, ACTIVITY_BLINK_MS);
      });
    }
    return () => {
      if (unsubscribe) unsubscribe();
      if (busyTimer.current) clearTimeout(busyTimer.current);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging.current) return;
    const rawHeight = window.innerHeight - e.clientY;
    const maxHeight = Math.max(MIN_HEIGHT, window.innerHeight - MAX_TOP_GAP);
    const clampedHeight = Math.min(Math.max(rawHeight, MIN_HEIGHT), maxHeight);
    setHeight(clampedHeight);
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  const toggleCollapsed = () => {
    setHeight((previous) => (previous <= COLLAPSED_THRESHOLD ? DEFAULT_HEIGHT : MIN_HEIGHT));
  };

  const copyLogs = async () => {
    try {
      await navigator.clipboard.writeText(logs.join('\n'));
      setCopied(true);
      if (copiedTimer.current) {
        clearTimeout(copiedTimer.current);
      }
      copiedTimer.current = setTimeout(() => setCopied(false), 1400);
    } catch (error) {
      console.error('Failed to copy logs', error);
    }
  };

  return (
    <div 
      style={{ height: `${height}px` }} 
      className={`bg-[#0a0a0b] border-t border-zinc-800 flex flex-col font-mono text-xs text-green-400 group relative select-all selection:bg-green-400/20 transition-shadow ${
        isCollapsed && isBusyPulse ? 'shadow-[0_-8px_24px_rgba(52,211,153,0.16)]' : ''
      }`}
    >
      <div 
        onMouseDown={handleMouseDown}
        onDoubleClick={toggleCollapsed}
        className="h-1.5 -mt-0.5 md:h-2 md:-mt-1 w-full cursor-row-resize bg-transparent hover:bg-indigo-500/50 transition z-10 absolute top-0 left-0" 
      />
      <div className="flex items-center justify-between px-4 py-2 bg-[#121214]/80 backdrop-blur border-b border-zinc-800">
        <div className="flex items-center space-x-2 text-zinc-400 font-sans font-medium text-xs tracking-wider uppercase">
          <Terminal size={14} className="text-zinc-500" />
          <span>Nexus Connect Local Terminal</span>
          {isCollapsed && (
            <div className="ml-1 inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
              <span className={`h-1.5 w-1.5 rounded-full ${isBusyPulse ? 'bg-emerald-300 animate-ping' : 'bg-zinc-500'}`} />
              <span>{isBusyPulse ? 'Processing' : 'Idle'}</span>
            </div>
          )}
        </div>
        <button
          onClick={() => void copyLogs()}
          className="text-zinc-500 hover:text-white transition opacity-0 group-hover:opacity-100"
          title="Copy Logs"
        >
          <Copy size={14} />
        </button>
      </div>

      {isCollapsed ? (
        <div className="flex items-center justify-between px-4 py-1.5 text-[11px] text-zinc-500">
          <span>{copied ? 'Logs copied' : 'Double-click top drag bar to expand'}</span>
          {isBusyPulse && (
            <div className="inline-flex items-center gap-1.5 text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse" />
              <span>New output</span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 p-4 overflow-y-auto space-y-1 scrollbar-hide">
          {logs.map((log, i) => (
            <div key={i} className={`flex items-start space-x-3 ${log.includes('ERROR') ? 'text-red-400' : ''} ${log.includes('SUCCESS') ? 'text-blue-400' : ''}`}>
              <span className="text-zinc-600 select-none">~</span>
              <span className="leading-relaxed opacity-90">{log}</span>
            </div>
          ))}
          <div ref={bottomRef} className="h-4" />
        </div>
      )}
    </div>
  );
}