---
name: debug
version: "1.0.0"
description: "Read and summarise the zeroclaw runtime trace log. Shows what the agent has been doing — tool calls, skill invocations, errors, LLM iterations, and turn outcomes. Use this to diagnose why something failed or stalled."
argument-hint: 'debug, debug last 20, debug errors only'
allowed-tools: Bash, Read
user-invocable: true
---

# debug: Diagnose Agent Activity from the Runtime Trace

## Parse Arguments

- Default: show the last **20** trace entries
- `last N` → show last N entries
- `errors only` → filter to entries where success=false or output contains "Error"
- `full` → show last 50 entries with full content

## Step 1: Read the trace

```bash
TRACE=/zeroclaw-data/workspace/state/runtime-trace.jsonl
python3 - <<'EOF'
import json, sys, os

trace_path = "/zeroclaw-data/workspace/state/runtime-trace.jsonl"
limit = {LIMIT}
errors_only = {ERRORS_ONLY}

if not os.path.exists(trace_path):
    print("ERROR: Trace file not found at", trace_path)
    sys.exit(1)

with open(trace_path) as f:
    lines = [l.strip() for l in f if l.strip()]

entries = []
for line in lines:
    try:
        entries.append(json.loads(line))
    except:
        pass

if errors_only:
    entries = [e for e in entries if
        not e.get("success", True) or
        "Error" in str(e.get("payload", {}))]

entries = entries[-limit:]

for e in entries:
    ts = e.get("timestamp", "")[:19]
    et = e.get("event_type", "")
    ok = e.get("success", True)
    payload = e.get("payload", {})

    if et == "channel_message_inbound":
        detail = f"[IN] {payload.get('content_preview', '')}"
    elif et == "llm_request":
        detail = f"[LLM REQ] iter={payload.get('iteration')} msgs={payload.get('messages_count')}"
    elif et == "llm_response":
        dur = payload.get("duration_ms", "?")
        tc = payload.get("parsed_tool_calls", 0)
        rc = payload.get("raw_response", "")[:200].replace("\n", " ")
        detail = f"[LLM RESP] ok={ok} dur={dur}ms tool_calls={tc} | {rc}"
    elif et in ("tool_call_start", "tool_call"):
        tool = payload.get("tool") or payload.get("tool_name", "")
        args = str(payload.get("arguments") or payload.get("args", "")).replace("\n", " ")[:200]
        detail = f"[TOOL CALL] {tool} | {args}"
    elif et == "tool_call_result":
        tool = payload.get("tool", "")
        out = str(payload.get("output", "")).replace("\n", " ")[:200]
        detail = f"[TOOL RESULT] {tool} | {out}"
    elif et == "turn_final_response":
        text = str(payload.get("text", "")).replace("\n", " ")[:200]
        detail = f"[FINAL] {text}"
    elif et == "channel_message_outbound":
        preview = str(payload.get("content_preview", "")).replace("\n", " ")[:200]
        detail = f"[OUT] {preview}"
    else:
        detail = f"[{et}] {str(payload)[:150]}"

    status = "" if ok else " ⚠️"
    print(f"{ts}{status} {detail}")

print(f"\n--- {len(entries)} entries shown ---")
EOF
```

Replace `{LIMIT}` with the number (default 20, or user-specified N).
Replace `{ERRORS_ONLY}` with `True` or `False`.

Use a timeout of **15000ms**.

## Step 2: Summarise

After displaying the raw timeline, provide a short human-readable summary:

```
## Summary

**Last activity:** [timestamp and what happened]
**Turns completed:** [count of turn_final_response events]
**Tool calls:** [total, and any that errored]
**Errors detected:** [list any Error messages found in tool_call_result]
**Likely issue (if any):** [your diagnosis in 1-2 sentences]
```

Focus the diagnosis on: blocked shell commands, missing files, null token counts, tool_calls=0 (model not calling tools), or API errors.
