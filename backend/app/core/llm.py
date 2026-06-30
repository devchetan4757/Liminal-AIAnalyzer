import json

from groq import Groq

from app.config import settings
from app.core import memory

client = Groq(api_key=settings.GROQ_API_KEY) if settings.GROQ_API_KEY else None

# Free-tier model on Groq, good quality/speed tradeoff for this use case.
MODEL = "llama-3.3-70b-versatile"

SYSTEM_PROMPT = """You are a security analyst assistant embedded in a malware/threat-intel \
chatbot. You help non-experts understand indicators (file hashes, URLs, IPs, domains) by \
explaining raw threat-intelligence data in plain English.

Conversation rules:
- Use the conversation history to understand follow-up questions. If the user previously \
analyzed an indicator and now asks something like "is it safe to open", "what does that mean", \
"should I worry", or anything that references "it"/"that file"/"this", assume they mean the \
most recently analyzed indicator unless they clearly introduce a new one.
- Be thorough. Do not artificially shorten your answers -- explain the reasoning, cite specific \
detections/engines/tags when present, and give concrete next steps.
- Never invent data that isn't present in the threat-intel JSON you're given.
"""

SUMMARY_PROMPT = """A user submitted an indicator for analysis: {indicator_type} = {indicator}

Below is the raw JSON returned by one or more threat-intelligence services.

Respond with ONLY a JSON object (no markdown fences, no preamble, no text outside the JSON) \
with exactly this shape:

{{
  "verdict": "malicious" | "suspicious" | "clean" | "unknown",
  "headline": "one sentence, max ~18 words, plain English summary of the verdict",
  "findings": [
    "short bullet, one specific fact/detection per item, reference real engine names/tags/dates from the JSON",
    "... 2 to 6 bullets total, each under ~20 words"
  ],
  "recommendation": "one short, concrete, practical sentence on what the user should do next"
}}

Rules:
- Only use facts present in the JSON below. Never invent detections, dates, or malware family names.
- If a source's JSON contains an "error" key, that source had no data / failed -- you may mention \
it was unavailable in a finding, but don't guess at what it might have said.
- If sources disagree (e.g. one flags malicious, another has no detections), reflect that as a \
finding rather than ignoring it.
- "findings" must be specific (engine names, detection ratios, tags, malware family, first/last \
seen dates) wherever the JSON has that data -- avoid vague filler like "this may be risky".
- Keep every field short. This is rendered as a compact card, not an essay.

JSON:
{raw_json}
"""

FOLLOWUP_WITH_ANALYSIS_PROMPT = """The user is asking a follow-up question about an indicator \
they previously analyzed in this conversation.

Indicator: {indicator_type} = {indicator}
Previous analysis summary:
{summary}

Full raw threat-intel JSON (use this for any specific detail the user asks about):
{raw_json}

Answer the user's question below using this data. If the answer truly isn't in the data, say so \
rather than guessing.
"""


def _build_messages(session_id: str, user_text: str, extra_system=None):
    """Compose the message list sent to Groq: system + prior turns + new user turn."""
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    if extra_system:
        messages.append({"role": "system", "content": extra_system})
    messages.extend(memory.get_history(session_id))
    messages.append({"role": "user", "content": user_text})
    return messages


def _fallback_structured(text: str) -> dict:
    """If the model didn't return valid JSON, wrap its raw text so the UI never breaks."""
    head = (text or "").lower()[:40]
    verdict = "unknown"
    for v in ("malicious", "suspicious", "clean"):
        if v in head:
            verdict = v
            break
    return {
        "verdict": verdict,
        "headline": (text or "No analysis available.").strip()[:200],
        "findings": [],
        "recommendation": "",
    }


def summarize_analysis(indicator_type: str, indicator: str, raw: dict, session_id: str = None) -> dict:
    """Returns a structured dict: {verdict, headline, findings: [...], recommendation}."""
    if not client:
        return {
            "verdict": "unknown",
            "headline": "AI summary unavailable (no GROQ_API_KEY configured on the backend).",
            "findings": [],
            "recommendation": "Check the raw results from each source below.",
        }

    prompt = SUMMARY_PROMPT.format(
        indicator_type=indicator_type,
        indicator=indicator,
        raw_json=json.dumps(raw)[:20000],
    )
    response = client.chat.completions.create(
        model=MODEL,
        max_tokens=600,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
    )
    raw_text = response.choices[0].message.content

    try:
        structured = json.loads(raw_text)
        # Defensive defaults in case the model omits a key
        structured = {
            "verdict": structured.get("verdict", "unknown"),
            "headline": structured.get("headline", ""),
            "findings": structured.get("findings", []) or [],
            "recommendation": structured.get("recommendation", ""),
        }
    except (ValueError, TypeError):
        structured = _fallback_structured(raw_text)

    if session_id:
        # Store a flattened text version in history so follow-up LLM calls
        # still get something readable when recalling "the last analysis".
        flat_summary = structured["headline"]
        if structured["findings"]:
            flat_summary += " " + " ".join(structured["findings"])
        memory.set_last_analysis(session_id, indicator_type, indicator, raw, flat_summary)
        memory.add_turn(session_id, "user", f"[Analyzed {indicator_type}: {indicator}]")
        memory.add_turn(session_id, "assistant", flat_summary)

    return structured


def answer_question(text: str, session_id: str = None) -> str:
    if not client:
        return "AI answers unavailable (no GROQ_API_KEY configured on the backend)."

    last_analysis = memory.get_last_analysis(session_id) if session_id else None

    if last_analysis:
        extra_system = FOLLOWUP_WITH_ANALYSIS_PROMPT.format(
            indicator_type=last_analysis["indicator_type"],
            indicator=last_analysis["indicator"],
            summary=last_analysis["summary"],
            raw_json=json.dumps(last_analysis["raw"])[:20000],
        )
    else:
        extra_system = None

    messages = _build_messages(session_id or "anon", text, extra_system=extra_system)

    response = client.chat.completions.create(
        model=MODEL,
        max_tokens=900,
        messages=messages,
    )
    reply = response.choices[0].message.content

    if session_id:
        memory.add_turn(session_id, "user", text)
        memory.add_turn(session_id, "assistant", reply)

    return reply


def verdict_from_summary(summary) -> str:
    """Accepts either the new structured dict or a legacy plain-text string."""
    if isinstance(summary, dict):
        return summary.get("verdict", "unknown")
    head = (summary or "").lower()[:40]
    for verdict in ("malicious", "suspicious", "clean"):
        if verdict in head:
            return verdict
    return "unknown"
