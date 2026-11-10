import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { createCursorSwarm, type CursorSwarmOptions } from "./index.js";

const useClientLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;
const DEFAULT_OPTIONS: CursorSwarmOptions = {};
export interface CursorSwarmProps {
  children?: ReactNode;
  enabled?: boolean;
  /** Stable reference; changing it recreates the controller. */
  options?: CursorSwarmOptions;
  /** Route/content revision; changing it explicitly starts a new animation. */
  resetKey?: unknown;
  className?: string;
}
export function CursorSwarm({
  children,
  enabled = true,
  options = DEFAULT_OPTIONS,
  resetKey,
  className,
}: CursorSwarmProps) {
  const root = useRef<HTMLDivElement>(null);
  useClientLayoutEffect(() => {
    if (!enabled || !root.current) return;
    const engine = createCursorSwarm(root.current, options);
    engine.start();
    return () => engine.dispose();
  }, [enabled, options, resetKey]);
  return enabled ? (
    <div ref={root} className={className ?? "cursor-swarm"}>
      {children}
    </div>
  ) : (
    <>{children}</>
  );
}
