/** Independent DOM choreography. No upstream animation engine code. */
export interface CursorSwarmOptions {
  /** Elements within root to animate; root itself is not selected. */
  selector?: string;
  textSelector?: string;
  /** Interactive ancestors and descendants are excluded. */
  exclude?: string;
  speed?: number;
  desktopWorkers?: number;
  mobileWorkers?: number;
  mobileBreakpoint?: number;
  colors?: readonly string[];
  labels?: readonly string[];
  observeChanges?: boolean;
  escapeToSkip?: boolean;
}
export interface CursorSwarmController {
  /** Starts or explicitly restarts, collecting current DOM nodes. */
  start(): void;
  /** Reveals content and ignores later mutations until start() is called. */
  skip(): void;
  /** Restores content and removes frames, observers, nodes and listeners. */
  dispose(): void;
}
const activeRoots = new Map<HTMLElement, symbol>();
const DEFAULT_COLORS = [
  "#b7c4ff",
  "#9de1c3",
  "#f0be91",
  "#d2a9f1",
  "#8fcce9",
  "#e4a9b9",
  "#dfd58f",
];
function normalizeOptions(root: HTMLElement, options: CursorSwarmOptions) {
  const settings = {
    selector: "h1,h2,h3,h4,h5,h6,p,[data-cursor-swarm]",
    textSelector: "h1,h2,h3,h4,h5,h6,p,small,time",
    exclude:
      'form,button,input,textarea,select,dialog,[role="dialog"],[data-cursor-swarm-ignore]',
    speed: 1.5,
    desktopWorkers: 7,
    mobileWorkers: 4,
    mobileBreakpoint: 600,
    colors: DEFAULT_COLORS as readonly string[],
    labels: [
      "Layout",
      "Type",
      "Components",
      "Style",
      "Images",
      "Details",
      "Review",
    ] as readonly string[],
    observeChanges: true,
    escapeToSkip: true,
    ...options,
  };
  for (const key of [
    "speed",
    "desktopWorkers",
    "mobileWorkers",
    "mobileBreakpoint",
  ] as const) {
    if (!Number.isFinite(settings[key]) || settings[key] <= 0)
      throw new TypeError(`Invalid cursor swarm option: ${key}`);
  }
  for (const count of [settings.desktopWorkers, settings.mobileWorkers])
    if (!Number.isInteger(count) || count > 32)
      throw new TypeError("Worker counts must be integers from 1 to 32");
  if (
    !settings.colors.length ||
    !settings.labels.length ||
    settings.colors.some(
      (c) => typeof c !== "string" || !CSS.supports("color", c),
    ) ||
    settings.labels.some((s) => typeof s !== "string")
  )
    throw new TypeError("Nonempty valid colors and labels are required");
  for (const selector of [
    settings.selector,
    settings.textSelector,
    settings.exclude,
  ]) {
    if (typeof selector !== "string" || !selector.trim())
      throw new TypeError("Selectors must be nonempty CSS selectors");
    root.querySelector(selector); // Validate before mutating any content.
  }
  return settings;
}

type Job = {
  element: HTMLElement;
  state: "waiting" | "active" | "done";
  parent?: Job;
  text: boolean;
};
type Point = { x: number; y: number };
type Worker = Point & {
  node: HTMLDivElement;
  outline: HTMLDivElement;
  measure: HTMLDivElement;
  job?: Job;
  phase: "idle" | "travel" | "build";
  from: Point;
  since: number;
  index: number;
};

export function createCursorSwarm(
  root: HTMLElement,
  options: CursorSwarmOptions = {},
): CursorSwarmController {
  if (typeof window === "undefined" || !root || root.nodeType !== 1)
    throw new TypeError("createCursorSwarm requires a browser HTMLElement");
  const settings = normalizeOptions(root, options);
  const owner = Symbol("cursor swarm owner");
  const { speed: SPEED, colors: COLORS, labels: NAMES } = settings;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let elements: HTMLElement[] = [];
  const originals = new Map<
    HTMLElement,
    {
      opacity: string;
      opacityPriority: string;
      clipPath: string;
      clipPriority: string;
      inert: boolean;
    }
  >();
  let observer: MutationObserver | undefined;
  let pending = 0;
  let jobs: Job[] = [],
    workers: Worker[] = [],
    frame = 0,
    running = false,
    disposed = false,
    completed = 0,
    startTime = 0;
  function restore(el: HTMLElement) {
    const original = originals.get(el);
    if (!original) return;
    if (original.opacity)
      el.style.setProperty(
        "opacity",
        original.opacity,
        original.opacityPriority,
      );
    else el.style.removeProperty("opacity");
    if (original.clipPath)
      el.style.setProperty(
        "clip-path",
        original.clipPath,
        original.clipPriority,
      );
    else el.style.removeProperty("clip-path");
    el.inert = original.inert;
  }
  function stopObserving() {
    observer?.disconnect();
    observer = undefined;
    cancelAnimationFrame(pending);
    pending = 0;
  }
  function clear() {
    running = false;
    cancelAnimationFrame(frame);
    for (const el of elements) restore(el);
    for (const w of workers) {
      w.node.remove();
      w.outline.remove();
    }
    workers = [];
    originals.clear();
  }
  function releaseRoot() {
    if (activeRoots.get(root) === owner) activeRoots.delete(root);
  }
  function skip() {
    if (disposed) return;
    stopObserving();
    clear();
    completed = elements.length;
    releaseRoot();
  }
  function complete(w: Worker) {
    if (!w.job) return;
    restore(w.job.element);
    w.job.state = "done";
    completed++;
    w.job = undefined;
    w.phase = "idle";
    w.outline.hidden = true;
  }
  function tick(timestamp: number) {
    if (!running || disposed) return;
    const now = timestamp * SPEED;
    if (document.hidden) {
      frame = requestAnimationFrame(tick);
      return;
    }
    for (const w of workers) {
      if (!w.job) {
        const ready = jobs.find(
          (j) =>
            j.state === "waiting" &&
            (!j.parent || j.parent.state === "done") &&
            j.element.getBoundingClientRect().top < innerHeight - 40,
        );
        if (ready && now - startTime > 450 + w.index * 60) {
          w.job = ready;
          ready.state = "active";
          w.phase = "travel";
          w.from = { x: w.x, y: w.y };
          w.since = now;
        }
      }
      if (w.job) {
        const r = w.job.element.getBoundingClientRect();
        if (w.phase === "travel") {
          const t = Math.min(1, (now - w.since) / 450),
            eased = 1 - (1 - t) ** 3;
          w.x = w.from.x + (r.left - w.from.x) * eased;
          w.y = w.from.y + (r.top - w.from.y) * eased;
          if (t === 1) {
            w.phase = "build";
            w.since = now;
            w.job.element.style.opacity = "1";
            w.job.element.style.clipPath = "inset(0 100% 0 0)";
          }
        } else {
          const duration = w.job.text
            ? Math.min(
                1600,
                500 + (w.job.element.textContent?.length || 0) * 22,
              )
            : 850;
          const t = Math.min(1, (now - w.since) / duration);
          w.outline.hidden = false;
          Object.assign(w.outline.style, {
            left: `${r.left}px`,
            top: `${r.top}px`,
            width: `${r.width * t}px`,
            height: `${r.height}px`,
          });
          w.measure.textContent = w.job.text
            ? `${Math.ceil((w.job.element.textContent?.trim().length || 0) * t)} chars`
            : `${Math.round(r.width * t)} × ${Math.round(r.height)}`;
          w.x = r.left + r.width * t;
          w.y = w.job.text ? r.top + r.height * 0.65 : r.bottom;
          w.job.element.style.clipPath = `inset(0 ${(1 - t) * 100}% 0 0)`;
          if (t === 1) complete(w);
        }
      } else {
        const angle = now * 0.0007 + (w.index * 2 * Math.PI) / workers.length;
        const target = {
          x:
            innerWidth * 0.5 +
            Math.cos(angle) *
              (innerWidth < settings.mobileBreakpoint ? 70 : 130),
          y: Math.min(innerHeight * 0.6, 390) + Math.sin(angle) * 55,
        };
        w.x += (target.x - w.x) * 0.045;
        w.y += (target.y - w.y) * 0.045;
      }
      w.node.style.transform = `translate3d(${w.x}px,${w.y}px,0)`;
    }
    if (completed === elements.length) {
      clear();
      return;
    }
    frame = requestAnimationFrame(tick);
  }
  function start() {
    if (disposed) return;
    stopObserving();
    clear();
    if (reduced.matches) {
      releaseRoot();
      return;
    }
    for (const [other, otherOwner] of activeRoots) {
      if (
        otherOwner !== owner &&
        (other === root || other.contains(root) || root.contains(other))
      )
        throw new Error("Cursor swarm roots must not overlap");
    }
    activeRoots.set(root, owner);
    elements = [
      ...root.querySelectorAll<HTMLElement>(settings.selector),
    ].filter(
      (el) =>
        el.getBoundingClientRect().width > 0 &&
        !el.closest(settings.exclude) &&
        !el.querySelector(settings.exclude),
    );
    if (settings.observeChanges) {
      observer = new MutationObserver((records) => {
        // body can be a root: ignore both overlay insertion/removal and its labels.
        const isOverlay = (node: Node) => {
          const el =
            node.nodeType === 1 ? (node as Element) : node.parentElement;
          return Boolean(
            el?.closest(".cursor-swarm-worker,.cursor-swarm-outline"),
          );
        };
        const changed = records.some(
          (record) =>
            !isOverlay(record.target) &&
            [...record.addedNodes, ...record.removedNodes].some(
              (node) => !isOverlay(node),
            ),
        );
        if (!changed) return;
        clear();
        cancelAnimationFrame(pending);
        pending = requestAnimationFrame(() => {
          pending = 0;
          start();
        });
      });
      observer.observe(root, { childList: true, subtree: true });
    }
    if (!elements.length) return;
    for (const el of elements)
      originals.set(el, {
        opacity: el.style.getPropertyValue("opacity"),
        opacityPriority: el.style.getPropertyPriority("opacity"),
        clipPath: el.style.getPropertyValue("clip-path"),
        clipPriority: el.style.getPropertyPriority("clip-path"),
        inert: el.inert,
      });
    completed = 0;
    jobs = elements.map((element) => {
      element.style.opacity = "0";
      element.inert = true;
      return {
        element,
        state: "waiting",
        text: element.matches(settings.textSelector),
      };
    });
    for (const job of jobs)
      job.parent = jobs
        .filter((other) => other !== job && other.element.contains(job.element))
        .at(-1);
    workers = Array.from(
      {
        length:
          innerWidth < settings.mobileBreakpoint
            ? settings.mobileWorkers
            : settings.desktopWorkers,
      },
      (_, index) => {
        const color = COLORS[index % COLORS.length];
        const node = document.createElement("div"),
          outline = document.createElement("div"),
          measure = document.createElement("div");
        node.className = "cursor-swarm-worker";
        outline.className = "cursor-swarm-outline";
        measure.className = "cursor-swarm-measure";
        node.setAttribute("aria-hidden", "true");
        outline.setAttribute("aria-hidden", "true");
        node.style.setProperty("--cursor-swarm-color", color);
        outline.style.setProperty("--cursor-swarm-color", color);
        // Configurable colors and labels never enter HTML markup.
        const svg = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "svg",
        );
        svg.setAttribute("viewBox", "0 0 22 28");
        const path = document.createElementNS(svg.namespaceURI, "path");
        path.setAttribute("d", "M2 2L19 15L11 16L7 24Z");
        path.setAttribute("fill", color);
        path.setAttribute("stroke", "#17202e");
        path.setAttribute("stroke-width", "1.5");
        svg.append(path);
        const label = document.createElement("span");
        label.textContent = NAMES[index % NAMES.length];
        node.append(svg, label);
        outline.append(measure);
        outline.hidden = true;
        document.body.append(node, outline);
        return {
          node,
          outline,
          measure,
          color,
          phase: "idle",
          from: { x: 0, y: 0 },
          since: 0,
          index,
          x: innerWidth / 2,
          y: innerHeight * 0.4,
        };
      },
    );
    running = true;
    startTime = performance.now() * SPEED;
    frame = requestAnimationFrame(tick);
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") skip();
  };
  const onMotion = () => {
    if (reduced.matches) skip();
  };
  if (settings.escapeToSkip) window.addEventListener("keydown", onKey);
  reduced.addEventListener("change", onMotion);
  return {
    start,
    skip,
    dispose() {
      disposed = true;
      stopObserving();
      clear();
      releaseRoot();
      window.removeEventListener("keydown", onKey);
      reduced.removeEventListener("change", onMotion);
    },
  };
}
