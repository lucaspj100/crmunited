import { forwardRef } from "react";
import {
  FORMATS, TEAM_SIGNATURE, initialsOf, pieceTexts,
  type ShareFormat, type ShareTemplate, type ShareSubject, type TitleKey,
} from "@/lib/achievement-share";

export type CardProps = {
  subject: ShareSubject;
  photos: Record<string, string | null>;
  showPhoto: boolean;
  photoZoom: number;
  photoOffsetY: number;
  titleKey: TitleKey;
  phrase: string;
  official: boolean;
  year: number;
  month: number;
  format: ShareFormat;
  template: ShareTemplate;
  logoUrl?: string | null;
  /** Exibir o número da conquista (opcional, escolha do vendedor). */
  showValue?: boolean;
  valueText?: string;
};


const ACCENT = [
  { main: "#f4c542", soft: "#7a5c12", text: "#fde9a9" }, // ouro
  { main: "#cbd5e1", soft: "#4a5568", text: "#e8eef5" }, // prata
  { main: "#c2803f", soft: "#5c3a17", text: "#f0d3b4" }, // bronze
];

function accentFor(subject: ShareSubject) {
  if (subject.kind === "top3" || subject.kind === "highlight") return ACCENT[0];
  return ACCENT[Math.min(subject.position, 3) - 1] ?? ACCENT[0];
}


function Photo({
  person, photos, u, size, accent, showPhoto, zoom, offsetY,
}: {
  person: { id: string; nome: string };
  photos: Record<string, string | null>;
  u: number; size: number; accent: string; showPhoto: boolean; zoom: number; offsetY: number;
}) {
  const src = photos[person.id] ?? null;
  return (
    <div
      style={{
        width: size, height: size, borderRadius: "50%", overflow: "hidden",
        border: `${6 * u}px solid ${accent}`,
        boxShadow: `0 0 ${40 * u}px ${accent}55`,
        background: "linear-gradient(135deg,#1e3a8a,#0f172a)",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {showPhoto && src ? (
        <img
          src={src}
          alt=""
          style={{
            width: "100%", height: "100%", objectFit: "cover",
            transform: `scale(${zoom}) translateY(${offsetY}%)`,
          }}
        />
      ) : (
        <span style={{ fontSize: size * 0.34, fontWeight: 900, color: "#ffffff", letterSpacing: size * 0.01 }}>
          {initialsOf(person.nome)}
        </span>
      )}
    </div>
  );
}

export const AchievementCard = forwardRef<HTMLDivElement, CardProps>(function AchievementCard(props, ref) {
  const { subject, format, template, official, year, month, titleKey, phrase, photos, showPhoto, photoZoom, photoOffsetY, logoUrl } = props;
  const { w, h } = FORMATS[format];
  const u = Math.min(w, h) / 1080;
  const horizontal = format === "linkedin";
  const accent = accentFor(subject);
  const t = pieceTexts({ subject, titleKey, official, year, month });

  const executive = template === "executive";
  const bg = executive
    ? "linear-gradient(160deg,#0a0f1c 0%,#0d1730 55%,#070b14 100%)"
    : "radial-gradient(120% 80% at 50% 0%, #16264d 0%, #0b1226 45%, #05080f 100%)";

  const signature = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14 * u }}>
      {logoUrl && <img src={logoUrl} alt="" style={{ height: 34 * u, objectFit: "contain" }} />}
      <span style={{
        fontSize: 22 * u, fontWeight: 800, letterSpacing: 6 * u,
        color: "rgba(255,255,255,0.72)", textTransform: "uppercase",
      }}>
        {TEAM_SIGNATURE}
      </span>
    </div>
  );

  const statusChip = (
    <span style={{
      fontSize: 18 * u, fontWeight: 800, letterSpacing: 4 * u,
      padding: `${8 * u}px ${20 * u}px`, borderRadius: 999,
      border: `${1.5 * u}px solid ${official ? "#34d39966" : "#f59e0b66"}`,
      color: official ? "#6ee7b7" : "#fcd34d",
      background: official ? "#05966922" : "#f59e0b18",
      whiteSpace: "nowrap",
    }}>
      {t.statusTag}
    </span>
  );

  const headline = (
    <div style={{ textAlign: horizontal ? "left" : "center" }}>
      <div style={{
        fontSize: 20 * u, fontWeight: 700, letterSpacing: 7 * u,
        color: "rgba(255,255,255,0.55)", textTransform: "uppercase", marginBottom: 14 * u,
      }}>
        {TEAM_SIGNATURE} apresenta
      </div>
      <div style={{
        fontSize: (subject.kind === "top3" ? 62 : 72) * u,
        lineHeight: 1.02, fontWeight: 900, letterSpacing: -1 * u,
        color: accent.main,
        textShadow: executive ? "none" : `0 0 ${34 * u}px ${accent.main}55`,
      }}>
        {!executive && `${t.emoji} `}{t.headline}
      </div>
    </div>
  );

  const phraseBlock = (
    <div style={{
      fontSize: 26 * u, lineHeight: 1.35, color: "rgba(255,255,255,0.78)",
      fontStyle: "italic", textAlign: horizontal ? "left" : "center", maxWidth: horizontal ? 620 * u * 1.6 : "100%",
    }}>
      {phrase}
    </div>
  );

  // ── Peça coletiva Top 3 ──
  if (subject.kind === "top3") {
    const order = [subject.people[1], subject.people[0], subject.people[2]].filter(Boolean);
    const photoSize = horizontal ? 150 * u : 240 * u;
    return (
      <div ref={ref} style={{
        width: w, height: h, background: bg, color: "#fff", position: "relative", overflow: "hidden",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between",
        padding: `${(horizontal ? 46 : 90) * u}px ${70 * u}px`, fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
        boxSizing: "border-box",
      }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 * u }}>
          {signature}
          <div style={{
            fontSize: (horizontal ? 54 : 68) * u, fontWeight: 900, color: accent.main, textAlign: "center",
            textShadow: `0 0 ${30 * u}px ${accent.main}55`,
          }}>
            🏆 TOP 3 SALES CHAMPIONS
          </div>
          <div style={{ fontSize: 28 * u, color: "rgba(255,255,255,0.72)" }}>{t.subline}</div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 46 * u, width: "100%" }}>
          {order.map((p) => {
            const pos = subject.people.findIndex((x) => x.id === p.id) + 1;
            const a = ACCENT[pos - 1];
            const scale = pos === 1 ? 1.18 : 1;
            return (
              <div key={p.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 * u }}>
                <div style={{ fontSize: 40 * u }}>{["🥇", "🥈", "🥉"][pos - 1]}</div>
                <Photo person={p} photos={photos} u={u} size={photoSize * scale} accent={a.main}
                  showPhoto={showPhoto} zoom={props.photoZoom} offsetY={props.photoOffsetY} />
                <div style={{
                  fontSize: (pos === 1 ? 34 : 28) * u, fontWeight: 900, textAlign: "center",
                  maxWidth: photoSize * 1.5, lineHeight: 1.1,
                }}>
                  {p.nome}
                </div>
                <div style={{ fontSize: 22 * u, fontWeight: 800, letterSpacing: 3 * u, color: a.text }}>
                  {pos}º LUGAR
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 * u }}>
          {phraseBlock}
          {statusChip}
        </div>
      </div>
    );
  }

  // ── Peça individual (pódio ou destaque especial) ──
  const person = subject.person;
  const position = subject.kind === "solo" ? subject.position : 0;
  const isHighlight = subject.kind === "highlight";
  const photoSize = horizontal ? 250 * u : format === "feed" ? 330 * u : 420 * u;
  const medal = isHighlight ? t.emoji : (["🥇", "🥈", "🥉"][position - 1] ?? "🏅");
  const valueLine = props.showValue && props.valueText
    ? (
      <div style={{
        marginTop: 14 * u, fontSize: 28 * u, fontWeight: 700, color: "rgba(255,255,255,0.82)",
      }}>
        {props.valueText}
      </div>
    )
    : null;

  const core = (
    <>
      <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>
        {template === "royalty" && position === 1 && (
          <div style={{
            position: "absolute", top: -66 * u, left: "50%", transform: "translateX(-50%)",
            fontSize: 74 * u, lineHeight: 1,
          }}>
            👑
          </div>
        )}
        {(template === "podium" || isHighlight) && (
          <div style={{
            position: "absolute", top: -56 * u, left: "50%", transform: "translateX(-50%)",
            fontSize: 62 * u, lineHeight: 1,
          }}>
            {medal}
          </div>
        )}
        <Photo person={person} photos={photos} u={u} size={photoSize} accent={accent.main}
          showPhoto={showPhoto} zoom={photoZoom} offsetY={photoOffsetY} />
      </div>
      <div style={{ textAlign: horizontal ? "left" : "center" }}>
        <div style={{
          fontSize: (horizontal ? 60 : format === "feed" ? 66 : 84) * u,
          fontWeight: 900, lineHeight: 1.02, letterSpacing: -1.5 * u, textTransform: "uppercase",
        }}>
          {person.nome}
        </div>
        <div style={{ marginTop: 16 * u, fontSize: 30 * u, color: accent.text, fontWeight: 600 }}>
          {t.subline}
        </div>
        {valueLine}
        {template === "podium" && !isHighlight && (
          <div style={{
            marginTop: 18 * u, fontSize: 88 * u, fontWeight: 900, color: accent.main, lineHeight: 1,
          }}>
            {position}º
          </div>
        )}
      </div>
    </>
  );


  if (horizontal) {
    return (
      <div ref={ref} style={{
        width: w, height: h, background: bg, color: "#fff", overflow: "hidden", boxSizing: "border-box",
        display: "flex", alignItems: "center", gap: 60 * u, padding: `${56 * u}px ${70 * u}px`,
        fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif", position: "relative",
      }}>
        <div style={{
          position: "absolute", inset: 0,
          background: `radial-gradient(60% 100% at 100% 50%, ${accent.main}1f 0%, transparent 70%)`,
        }} />
        <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 26 * u }}>
          {template === "royalty" && position === 1 && <div style={{ fontSize: 60 * u, lineHeight: 1 }}>👑</div>}
          {(template === "podium" || isHighlight) && <div style={{ fontSize: 54 * u, lineHeight: 1 }}>{medal}</div>}

          <Photo person={person} photos={photos} u={u} size={photoSize} accent={accent.main}
            showPhoto={showPhoto} zoom={photoZoom} offsetY={photoOffsetY} />
        </div>
        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 22 * u, flex: 1, minWidth: 0 }}>
          {headline}
          <div style={{
            fontSize: 58 * u, fontWeight: 900, lineHeight: 1.02, textTransform: "uppercase", letterSpacing: -1 * u,
          }}>
            {person.nome}
          </div>
          <div style={{ fontSize: 27 * u, color: accent.text, fontWeight: 600 }}>{t.subline}</div>
          {valueLine}

          {phraseBlock}
          <div style={{ display: "flex", alignItems: "center", gap: 22 * u, marginTop: 4 * u }}>
            {statusChip}
            {signature}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} style={{
      width: w, height: h, background: bg, color: "#fff", overflow: "hidden", boxSizing: "border-box",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between",
      padding: `${(format === "feed" ? 70 : 120) * u}px ${80 * u}px`,
      fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif", position: "relative",
    }}>
      {!executive && (
        <div style={{
          position: "absolute", top: -160 * u, left: "50%", transform: "translateX(-50%)",
          width: 900 * u, height: 900 * u, borderRadius: "50%",
          background: `radial-gradient(circle, ${accent.main}26 0%, transparent 65%)`,
        }} />
      )}
      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 26 * u }}>
        {signature}
        {headline}
      </div>
      <div style={{
        position: "relative", display: "flex", flexDirection: "column", alignItems: "center",
        gap: (format === "feed" ? 30 : 52) * u,
      }}>
        {core}
      </div>
      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 22 * u }}>
        {phraseBlock}
        {statusChip}
        <div style={{ height: 3 * u, width: 120 * u, background: accent.main, opacity: 0.7, borderRadius: 999 }} />
      </div>
    </div>
  );
});
