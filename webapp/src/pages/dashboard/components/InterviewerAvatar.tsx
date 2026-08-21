import { useEffect, useRef, type MutableRefObject } from "react";

export interface AvatarPersona {
  id?: string;
  name: string;
  initials: string;
  gender?: string;
  style?: string;
  video_url?: string;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const SKIN = ["#f4d7c2", "#ecc4a0", "#dcab86", "#c68a5e", "#a56a41", "#87532f", "#f6d0a8", "#b98a63"];
const HAIR = ["#241c17", "#3f2a1d", "#5b3a1a", "#7a5230", "#1b1b1b", "#4a4a4a", "#6b4b2a", "#8a6a3a"];
const TOP = ["#334155", "#1f2937", "#3b5266", "#4b3f6b", "#374151", "#2f4858", "#3a3f52"];
const IRIS = ["#5b4636", "#3c2f27", "#2f4858", "#405a3c", "#4a3b2a"];

/** A flat-illustration interviewer that lip-syncs to speech, blinks, and
 *  breathes. When `persona.video_url` is set (neural-video provider), it plays
 *  that clip instead. Animation is driven by direct DOM writes for smoothness. */
export default function InterviewerAvatar({
  persona,
  speaking,
  boundaryTick = 0,
  amplitudeRef,
  className = "",
}: {
  persona: AvatarPersona;
  speaking: boolean;
  boundaryTick?: number;
  /** Live 0..1 waveform amplitude for real lip-sync (server neural voice).
   *  When absent/zero, a synthetic jaw oscillation is used instead. */
  amplitudeRef?: MutableRefObject<number>;
  className?: string;
}) {
  const seed = hash(persona.id || persona.name || "x");
  const skin = SKIN[seed % SKIN.length];
  const hair = HAIR[(seed >> 3) % HAIR.length];
  const top = TOP[(seed >> 6) % TOP.length];
  const iris = IRIS[(seed >> 9) % IRIS.length];
  const gender = persona.gender || "neutral";
  const longHair = gender === "female" || (gender === "neutral" && (seed & 1) === 0);

  const mouthRef = useRef<SVGPathElement>(null);
  const headRef = useRef<SVGGElement>(null);
  const lidLRef = useRef<SVGRectElement>(null);
  const lidRRef = useRef<SVGRectElement>(null);
  const browRef = useRef<SVGGElement>(null);

  const speakingRef = useRef(speaking);
  speakingRef.current = speaking;
  const spikeRef = useRef(0);
  const lastTick = useRef(boundaryTick);
  useEffect(() => {
    if (boundaryTick !== lastTick.current) {
      lastTick.current = boundaryTick;
      spikeRef.current = 1; // emphasise the mouth on each word boundary
    }
  }, [boundaryTick]);

  useEffect(() => {
    if (persona.video_url) return; // real video: no SVG animation needed
    let raf = 0;
    let nextBlink = performance.now() + 1500 + Math.random() * 3000;
    let blinkUntil = 0;

    const tick = () => {
      const now = performance.now();
      const t = now / 1000;

      // Breathing + micro head sway.
      const sway = Math.sin(t * 0.7) * 1.4;
      const bob = Math.sin(t * 0.9) * 0.8;
      headRef.current?.setAttribute("transform", `translate(${sway} ${bob}) rotate(${Math.sin(t * 0.45) * 1.1} 100 96)`);

      // Lip-sync: closed at rest; a jaw oscillation plus a decaying per-word
      // spike while speaking. Values are the mouth path's vertical opening.
      spikeRef.current *= 0.86;
      let open = 1.2;
      const amp = amplitudeRef?.current ?? 0;
      if (amp > 0.01) {
        // Real waveform amplitude from the neural voice → true lip-sync.
        open = 1.5 + amp * 8;
      } else if (speakingRef.current) {
        const osc = (Math.sin(t * 20) + 1) / 2; // 0..1
        open = 2 + osc * 5 + spikeRef.current * 4;
      }
      if (mouthRef.current) {
        const w = 22;
        const y = 132;
        // A lens-shaped mouth: two quadratic curves meeting at the corners.
        mouthRef.current.setAttribute(
          "d",
          `M ${100 - w} ${y} Q 100 ${y + open} ${100 + w} ${y} Q 100 ${y - open * 0.5} ${100 - w} ${y} Z`
        );
      }

      // Eye brows lift a touch while speaking (liveliness).
      const lift = speakingRef.current ? -1.2 + Math.sin(t * 8) * 0.6 : 0;
      browRef.current?.setAttribute("transform", `translate(0 ${lift})`);

      // Blinking.
      if (now > nextBlink && blinkUntil === 0) blinkUntil = now + 130;
      let lidH = 0;
      if (blinkUntil > 0) {
        if (now < blinkUntil) lidH = 7; // eyes closed
        else {
          blinkUntil = 0;
          nextBlink = now + 1800 + Math.random() * 3200;
        }
      }
      lidLRef.current?.setAttribute("height", String(lidH));
      lidRRef.current?.setAttribute("height", String(lidH));

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [persona.video_url, amplitudeRef]);

  if (persona.video_url) {
    return (
      <video
        src={persona.video_url}
        autoPlay
        playsInline
        className={`w-full h-full object-cover ${className}`}
      />
    );
  }

  return (
    <svg viewBox="0 0 200 200" className={`w-full h-full ${className}`} role="img" aria-label={`${persona.name}, interviewer`}>
      <defs>
        <clipPath id={`clip-${seed}`}>
          <rect x="0" y="0" width="200" height="200" />
        </clipPath>
      </defs>
      <g clipPath={`url(#clip-${seed})`}>
        <g ref={headRef}>
          {/* shoulders / blazer */}
          <path d={`M 40 200 Q 42 158 100 152 Q 158 158 160 200 Z`} fill={top} />
          <path d="M 100 152 L 92 176 L 100 182 L 108 176 Z" fill="#f8fafc" opacity="0.9" />
          {/* neck */}
          <rect x="88" y="130" width="24" height="26" rx="10" fill={skin} />
          <rect x="88" y="130" width="24" height="10" rx="5" fill="#000" opacity="0.08" />
          {/* long hair behind */}
          {longHair && <path d="M 58 92 Q 52 150 66 168 L 78 150 Q 70 120 74 92 Z M 142 92 Q 148 150 134 168 L 122 150 Q 130 120 126 92 Z" fill={hair} />}
          {/* ears */}
          <ellipse cx="63" cy="100" rx="7" ry="10" fill={skin} />
          <ellipse cx="137" cy="100" rx="7" ry="10" fill={skin} />
          {/* head */}
          <path d="M 66 96 Q 66 56 100 56 Q 134 56 134 96 Q 134 128 100 134 Q 66 128 66 96 Z" fill={skin} />
          {/* hair top */}
          {longHair ? (
            <path d="M 62 98 Q 58 54 100 50 Q 142 54 138 98 Q 132 74 116 68 Q 108 82 100 80 Q 92 82 84 68 Q 68 74 62 98 Z" fill={hair} />
          ) : (
            <path d="M 66 92 Q 62 56 100 54 Q 138 56 134 92 Q 128 72 100 70 Q 72 72 66 92 Z" fill={hair} />
          )}
          {/* eyebrows */}
          <g ref={browRef}>
            <rect x="76" y="94" width="18" height="3.4" rx="1.7" fill={hair} />
            <rect x="106" y="94" width="18" height="3.4" rx="1.7" fill={hair} />
          </g>
          {/* eyes */}
          <g>
            <ellipse cx="85" cy="104" rx="8.5" ry="6" fill="#fff" />
            <ellipse cx="115" cy="104" rx="8.5" ry="6" fill="#fff" />
            <circle cx="86" cy="104" r="3.4" fill={iris} />
            <circle cx="116" cy="104" r="3.4" fill={iris} />
            <circle cx="86" cy="104" r="1.5" fill="#1a1a1a" />
            <circle cx="116" cy="104" r="1.5" fill="#1a1a1a" />
            <circle cx="87.5" cy="102.5" r="1" fill="#fff" />
            <circle cx="117.5" cy="102.5" r="1" fill="#fff" />
            {/* eyelids for blinking (grow downward from the top of each eye) */}
            <rect ref={lidLRef} x="76.5" y="98" width="17" height="0" rx="3" fill={skin} />
            <rect ref={lidRRef} x="106.5" y="98" width="17" height="0" rx="3" fill={skin} />
          </g>
          {/* nose */}
          <path d="M 100 108 L 96 120 Q 100 123 104 120 Z" fill="#000" opacity="0.08" />
          {/* mouth */}
          <path ref={mouthRef} d="M 78 132 Q 100 133 122 132 Q 100 131 78 132 Z" fill="#7a2f2f" />
          <path d="M 78 132 Q 100 130 122 132" fill="none" stroke="#000" strokeOpacity="0.12" strokeWidth="1" />
        </g>
      </g>
    </svg>
  );
}
