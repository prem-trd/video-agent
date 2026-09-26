import { useEffect, useRef, useState } from "react";
import { api } from "../../services/api";
import type { Channel, ChannelPatch, Project } from "../../types/api";

interface Props {
  project: Project;
  channel: Channel;
  /** Changes whenever the first clip changes, to refetch the frame. */
  frameKey: string;
  onUpdate: (patch: ChannelPatch) => Promise<void>;
}

const MIN_SIZE = 4;
const MAX_SIZE = 30;
/** Same corner margin the old fixed positions used: 3% of the frame height. */
const MARGIN = 0.03;

interface Placement {
  x: number; // logo centre, fraction of frame width
  y: number; // logo centre, fraction of frame height
  size: number; // logo height, % of frame height
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Drag-and-zoom watermark placement over a real frame of the video:
 * drag the logo to move it, scroll / pinch over it (or drag the corner
 * handle) to resize, snap to a corner with the buttons. Saved to the
 * channel when you let go; the render uses the same centre + clamp maths.
 */
export function WatermarkEditor({ project, channel, frameKey, onUpdate }: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLImageElement>(null);
  const [placement, setPlacement] = useState<Placement>({ x: channel.watermarkX, y: channel.watermarkY, size: channel.watermarkSizePct });
  const [opacity, setOpacity] = useState(channel.watermarkOpacity);
  const [logoAspect, setLogoAspect] = useState(1); // width / height of the logo image
  const [frameFailed, setFrameFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const placementRef = useRef(placement);
  placementRef.current = placement;

  const [resW, resH] = project.resolution.split("x").map(Number);
  const frameAspect = resW && resH ? resW / resH : 16 / 9;

  // Keep the logo fully inside the frame, exactly like the render's overlay clamp.
  function clampPlacement(p: Placement): Placement {
    const size = clamp(p.size, MIN_SIZE, MAX_SIZE);
    const halfH = size / 200;
    const halfW = (size / 100) * logoAspect / frameAspect / 2;
    return { size, x: clamp(p.x, halfW, 1 - halfW), y: clamp(p.y, halfH, 1 - halfH) };
  }

  const save = async (p: Placement) => {
    setSaving(true);
    try {
      await onUpdate({ watermarkX: Number(p.x.toFixed(4)), watermarkY: Number(p.y.toFixed(4)), watermarkSizePct: Math.round(p.size * 10) / 10 });
    } finally {
      setSaving(false);
    }
  };

  // Mouse wheel / trackpad pinch over the logo zooms it (needs a non-passive listener to stop page scroll).
  const wheelTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    const el = logoRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const step = e.ctrlKey ? 0.25 : 0.5; // pinch sends many small ctrl+wheel events
      setPlacement((p) => clampPlacement({ ...p, size: p.size + (e.deltaY < 0 ? step : -step) }));
      clearTimeout(wheelTimer.current);
      wheelTimer.current = setTimeout(() => save(placementRef.current), 450);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  function startDrag(e: React.PointerEvent, mode: "move" | "resize") {
    e.preventDefault();
    e.stopPropagation();
    const frame = frameRef.current?.getBoundingClientRect();
    if (!frame) return;
    const start = { px: e.clientX, py: e.clientY, ...placementRef.current };
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - start.px;
      const dy = ev.clientY - start.py;
      if (mode === "move") {
        setPlacement(clampPlacement({ ...start, x: start.x + dx / frame.width, y: start.y + dy / frame.height }));
      } else {
        // Centre stays put; the handle moves a corner, so the height grows by twice the pointer travel.
        const fromDy = (2 * dy) / frame.height;
        const fromDx = (2 * dx) / frame.width * frameAspect / logoAspect;
        setPlacement(clampPlacement({ ...start, size: start.size + ((fromDx + fromDy) / 2) * 100 }));
      }
    };
    const onUp = () => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
      save(placementRef.current);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
  }

  function snap(corner: "TL" | "TR" | "BL" | "BR") {
    const halfH = placement.size / 200;
    const halfW = (placement.size / 100) * logoAspect / frameAspect / 2;
    const mx = MARGIN / frameAspect; // margin is 3% of the HEIGHT on every side
    const next = clampPlacement({
      ...placement,
      x: corner.endsWith("L") ? mx + halfW : 1 - mx - halfW,
      y: corner.startsWith("T") ? MARGIN + halfH : 1 - MARGIN - halfH,
    });
    setPlacement(next);
    save(next);
  }

  const logoUrl = api.channelFileUrl("logo", channel.logoName);

  return (
    <div className="wm-editor">
      <div className="wm-frame" ref={frameRef} style={{ aspectRatio: String(frameAspect) }}>
        {frameFailed ? (
          <div className="wm-frame-empty">Add a clip to the timeline to place the logo over your video</div>
        ) : (
          <img className="wm-frame-img" src={api.brandFrameUrl(project.id, frameKey)} alt="" draggable={false} onError={() => setFrameFailed(true)} />
        )}
        <div
          className="wm-logo-box"
          style={{
            left: `${placement.x * 100}%`,
            top: `${placement.y * 100}%`,
            height: `${placement.size}%`,
            aspectRatio: String(logoAspect),
          }}
          onPointerDown={(e) => startDrag(e, "move")}
          title="Drag to move · scroll or pinch to resize"
        >
          <img
            ref={logoRef}
            src={logoUrl}
            alt="Watermark"
            draggable={false}
            style={{ opacity }}
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth && img.naturalHeight) setLogoAspect(img.naturalWidth / img.naturalHeight);
            }}
          />
          <span className="wm-handle" onPointerDown={(e) => startDrag(e, "resize")} title="Drag to resize" />
        </div>
      </div>

      <div className="wm-toolbar">
        <div className="wm-snaps" aria-label="Snap to corner">
          {(["TL", "TR", "BL", "BR"] as const).map((c) => (
            <button key={c} className="icon-btn" onClick={() => snap(c)} title={`Snap to ${c.startsWith("T") ? "top" : "bottom"} ${c.endsWith("L") ? "left" : "right"}`}>
              {{ TL: "↖", TR: "↗", BL: "↙", BR: "↘" }[c]}
            </button>
          ))}
        </div>
        <span className="field-hint">
          Size {placement.size.toFixed(1)}% {saving ? "· saving…" : "· saved"}
        </span>
      </div>

      <div className="form-row" style={{ marginBottom: 0 }}>
        <label>Opacity — {Math.round(opacity * 100)}%</label>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={opacity}
          onChange={(e) => setOpacity(Number(e.target.value))}
          onPointerUp={() => onUpdate({ watermarkOpacity: opacity })}
          onKeyUp={() => onUpdate({ watermarkOpacity: opacity })}
        />
      </div>
      <span className="field-hint">Drag the logo to move it. Scroll or pinch over it — or drag its corner — to resize.</span>
    </div>
  );
}
