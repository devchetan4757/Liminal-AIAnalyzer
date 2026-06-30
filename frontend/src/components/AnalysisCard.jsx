import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Database,
  FileSearch,
  CircleCheck,
  Lightbulb,
  Copy,
  Download,
  Check
} from "lucide-react";
import VerdictBadge from "./VerdictBadge";

export default function AnalysisCard({ data }) {
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);

const handleCopy = () => {
  navigator.clipboard.writeText(indicator);
  setCopied(true);
  setTimeout(() => setCopied(false), 2000);
};

const handleExport = () => {
  const blob = new Blob([JSON.stringify({ indicator, indicator_type, verdict, score, headline, findings, recommendation, sources, raw }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `liminal-${indicator_type}-${indicator.slice(0, 16)}.json`;
  a.click();
  URL.revokeObjectURL(url);
};


  const {
    indicator,
    indicator_type,
    verdict,
    score,
    headline,
    findings,
    recommendation,
    sources,
    raw,
  } = data;

  return (
    <div className="analysis-card">

      <div className="analysis-card__header">

        <VerdictBadge verdict={verdict} />

        <div className="analysis-card__score">
          <span className="analysis-card__score-label">
            Confidence
          </span>

          <span className="analysis-card__score-value">
            {score}
          </span>
        </div>

      </div>

      <div className="analysis-card__section">

        <div className="analysis-card__label">
          <FileSearch size={15} />
          Indicator
        </div>

        <div className="analysis-card__indicator">

          <span className="analysis-card__type">
            {indicator_type}
          </span>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
  <code>{indicator}</code>
  <button onClick={handleCopy} className="analysis-card__icon-btn" title="Copy">
    {copied ? <Check size={14} /> : <Copy size={14} />}
  </button>
</div>

        </div>

      </div>

      {headline && (
        <div className="analysis-card__section">
          <p className="analysis-card__headline">
            {headline}
          </p>
        </div>
      )}

      {findings?.length > 0 && (
        <div className="analysis-card__section">

          <div className="analysis-card__label">
            <CircleCheck size={15} />
            Findings
          </div>

          <ul className="analysis-card__findings">
            {findings.map((finding, i) => (
              <li key={i}>{finding}</li>
            ))}
          </ul>

        </div>
      )}

      {recommendation && (
        <div className="analysis-card__section analysis-card__recommendation">
          <Lightbulb size={15} />
          <p>{recommendation}</p>
        </div>
      )}

      <div className="analysis-card__section">

        <div className="analysis-card__label">
          Sources
        </div>

        <div className="analysis-card__sources">

          {sources?.length ? (
            sources.map((source) => (
              <span
                key={source}
                className="analysis-card__chip"
              >
                {source}
              </span>
            ))
          ) : (
            <span className="analysis-card__chip">
              Unknown
            </span>
          )}

        </div>

      </div>

      <button className="analysis-card__toggle" onClick={handleExport}>
  <Download size={15} />
  Export JSON
</button>
      <button
        className="analysis-card__toggle"
        onClick={() => setShowRaw((s) => !s)}
      >
        <Database size={15} />

        {showRaw ? "Hide Raw Data" : "View Raw Data"}

        {showRaw ? (
          <ChevronUp size={15} />
        ) : (
          <ChevronDown size={15} />
        )}
      </button>

      {showRaw && (
        <pre className="analysis-card__raw">
          {JSON.stringify(raw, null, 2)}
        </pre>
      )}

    </div>
  );
}
