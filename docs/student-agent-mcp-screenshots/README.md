# Student MCP responsive screenshots

These screenshots use the local layout fixture with synthetic assignments, two synthetic study sessions, and a synthetic preview OAuth client. They contain no user records, tokens, live Supabase Auth session, or hosted MCP calls. The consent screenshot proves page layout only; it does not prove OAuth, PKCE, or client interoperability.

The capture helper uses a temporary Chrome profile and a localhost DevTools session to set each CSS viewport exactly. Its symbol fallback is fixture-only, so the preview does not depend on the external icon font.

Start the preview server and leave it running:

```powershell
node tools/layout-preview.cjs 4193
```

In a second terminal, capture the screenshots:

```powershell
node tools/capture-mcp-screenshots.cjs 4193
```

`measurements.json` records the requested CSS viewport, PNG dimensions, and measured horizontal page overflow for assignments, calendar agenda, session editor, connected agents, and consent at 1366×768, 1024×768, 768×1024, and 390×844.
