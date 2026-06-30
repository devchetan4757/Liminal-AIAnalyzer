import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  ShieldQuestion,
} from "lucide-react";

const VERDICTS = {
  malicious: {
    label: "Malicious",
    color: "#EF4444",
    bg: "rgba(239,68,68,.12)",
    Icon: ShieldX,
  },

  suspicious: {
    label: "Suspicious",
    color: "#F59E0B",
    bg: "rgba(245,158,11,.12)",
    Icon: ShieldAlert,
  },

  clean: {
    label: "Clean",
    color: "#22C55E",
    bg: "rgba(34,197,94,.12)",
    Icon: ShieldCheck,
  },

  unknown: {
    label: "Unknown",
    color: "var(--text-dim)",
    bg: "rgba(148,163,184,.12)",
    Icon: ShieldQuestion,
  },
};

export default function VerdictBadge({ verdict = "unknown" }) {
  const v = VERDICTS[verdict] || VERDICTS.unknown;

  return (
    <span
      className="verdict-badge"
      style={{
        color: v.color,
        backgroundColor: v.bg,
      }}
    >
      <v.Icon size={14} strokeWidth={2.2} />
      {v.label}
    </span>
  );
}
