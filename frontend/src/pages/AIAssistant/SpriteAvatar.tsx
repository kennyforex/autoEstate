import React, { useEffect, useState } from "react";
import {
  VO_SPRITE_DISPLAY_SCALE,
  VO_SPRITE_FRAME_H,
  VO_SPRITE_FRAME_W,
  VO_SPRITE_WALK_FRAMES,
} from "./virtualOfficeSpriteMeta";

const WALK_MS_PER_FRAME = 140;

export interface SpriteAvatarProps {
  variant: number;
  walking: boolean;
  facingRight: boolean;
  fallback: React.ReactNode;
}

export const SpriteAvatar: React.FC<SpriteAvatarProps> = ({
  variant,
  walking,
  facingRight,
  fallback,
}) => {
  const v = Math.max(0, Math.min(2, variant));
  const base = `/sprites/virtual-office/char${v}`;
  const [walkFrame, setWalkFrame] = useState(0);
  const [idleFailed, setIdleFailed] = useState(false);
  const [walkFailed, setWalkFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const idle = new Image();
    idle.onload = () => {
      if (!cancelled) setIdleFailed(false);
    };
    idle.onerror = () => {
      if (!cancelled) setIdleFailed(true);
    };
    idle.src = `${base}_idle.png`;
    const walk = new Image();
    walk.onload = () => {
      if (!cancelled) setWalkFailed(false);
    };
    walk.onerror = () => {
      if (!cancelled) setWalkFailed(true);
    };
    walk.src = `${base}_walk.png`;
    return () => {
      cancelled = true;
    };
  }, [base]);

  useEffect(() => {
    if (!walking) return;
    const id = window.setInterval(() => {
      setWalkFrame((f) => (f + 1) % VO_SPRITE_WALK_FRAMES);
    }, WALK_MS_PER_FRAME);
    return () => window.clearInterval(id);
  }, [walking]);

  const dw = VO_SPRITE_FRAME_W * VO_SPRITE_DISPLAY_SCALE;
  const dh = VO_SPRITE_FRAME_H * VO_SPRITE_DISPLAY_SCALE;
  const stripW =
    VO_SPRITE_FRAME_W * VO_SPRITE_WALK_FRAMES * VO_SPRITE_DISPLAY_SCALE;

  const flip = facingRight ? undefined : "scaleX(-1)";
  const commonStyle: React.CSSProperties = {
    imageRendering: "pixelated",
    transform: flip,
  };

  if (idleFailed || (walking && walkFailed)) {
    return <>{fallback}</>;
  }

  if (!walking) {
    return (
      <img
        src={`${base}_idle.png`}
        alt=""
        width={dw}
        height={dh}
        draggable={false}
        className="select-none"
        style={commonStyle}
        onError={() => setIdleFailed(true)}
      />
    );
  }

  return (
    <div
      className="shrink-0 overflow-hidden select-none"
      style={{
        width: dw,
        height: dh,
        backgroundImage: `url(${base}_walk.png)`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${stripW}px ${dh}px`,
        backgroundPosition: `${-walkFrame * dw}px 0`,
        ...commonStyle,
      }}
      role="img"
      aria-hidden
    />
  );
};
