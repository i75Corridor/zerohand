# debug-trace

Read the zeroclaw runtime trace log from the running Docker container, diagnose what is erroring, and fix it.

## Instructions

Run this command to read the trace:

```bash
docker exec zeroclaw cat /zeroclaw-data/workspace/state/runtime-trace.jsonl | python3 -c "
import json, sys

lines = [l.strip() for l in sys.stdin if l.strip()]
entries = []
for line in lines:
    try:
        entries.append(json.loads(line))
    except:
        pass

# Show last 40 entries
for e in entries[-40:]:
    ts = e.get('timestamp', '')[:19]
    et = e.get('event_type', '')
    ok = e.get('success', True)
    payload = e.get('payload', {})

    if et == 'channel_message_inbound':
        detail = f'[IN] {payload.get(\"content_preview\", \"\")}'
    elif et == 'llm_request':
        detail = f'[LLM REQ] iter={payload.get(\"iteration\")} msgs={payload.get(\"messages_count\")}'
    elif et == 'llm_response':
        dur = payload.get('duration_ms', '?')
        tc = payload.get('parsed_tool_calls', 0)
        rc = payload.get('raw_response', '')[:200].replace('\n', ' ')
        detail = f'[LLM RESP] ok={ok} dur={dur}ms tool_calls={tc} | {rc}'
    elif et in ('tool_call_start', 'tool_call'):
        tool = payload.get('tool') or payload.get('tool_name', '')
        args = str(payload.get('arguments') or payload.get('args', '')).replace('\n', ' ')[:200]
        detail = f'[TOOL CALL] {tool} | {args}'
    elif et == 'tool_call_result':
        tool = payload.get('tool', '')
        out = str(payload.get('output', '')).replace('\n', ' ')[:200]
        detail = f'[TOOL RESULT] {tool} | {out}'
    elif et == 'turn_final_response':
        text = str(payload.get('text', '')).replace('\n', ' ')[:200]
        detail = f'[FINAL] {text}'
    elif et == 'channel_message_outbound':
        preview = str(payload.get('content_preview', '')).replace('\n', ' ')[:150]
        detail = f'[OUT] {preview}'
    else:
        detail = f'[{et}] {str(payload)[:150]}'

    flag = ' ⚠️' if not ok else ''
    print(f'{ts}{flag} {detail}')

# Summary
errors = [e for e in entries if not e.get('success', True) or 'Error' in str(e.get('payload', {}))]
print(f'\n--- {min(40, len(entries))} of {len(entries)} entries shown | {len(errors)} errors detected ---')
"
```

After reading the output:

1. **Identify all errors** — look for `⚠️` lines, `[TOOL RESULT]` entries containing `Error:`, and `[LLM RESP]` with `tool_calls=0` when a tool should have been called.
2. **Diagnose the root cause** — common issues:
   - `Command not allowed by security policy` → add the command to `allowed_commands` in `zeroclaw-config/config.toml`
   - `Path blocked by security policy` → path is in `forbidden_paths`, change the path used
   - `tool_calls=0` repeatedly → model not calling tools; likely a model capability issue or prompt structure problem
   - `No such file or directory` → wrong path to a script or skill file
   - `ModuleNotFoundError` → missing Python package, add to `requirements.txt` and rebuild
   - `api_key` / auth errors → check `GEMINI_API_KEY` is set in `.env`
3. **Fix the issue** — edit the relevant file (`config.toml`, `docker-compose.yml`, `SKILL.md`, `requirements.txt`, etc.) and apply the fix.
4. **Verify** — if a restart or rebuild is needed, say so explicitly.
