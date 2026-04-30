# Cursor Scout Output Schema

The scout script writes a JSON document with this shape:

```json
{
  "status": "ok",
  "summary": "Short explanation of the likely implementation area.",
  "repo_root": "/absolute/path/to/repo",
  "folder_scope": "optional/relative/path",
  "recommended_files": [
    {
      "path": "relative/path/from/repo/root.ts",
      "reason": "Why this file should be read before editing.",
      "confidence": 0.9,
      "read_order": 1,
      "symbols": ["OptionalComponent", "optionalFunction"]
    }
  ],
  "supporting_files": [],
  "avoid_files": [],
  "queries_used": [],
  "implementation_notes": [],
  "verification_suggestions": [],
  "risks": []
}
```

Agents should read only the highest-confidence `recommended_files` first, then expand to `supporting_files` only when needed.

