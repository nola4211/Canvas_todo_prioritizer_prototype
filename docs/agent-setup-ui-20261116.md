# In-app agent connection setup — November 16, 2026

Local addition to **Settings → Connect your agent**, immediately above Connected agents. This change is not published or deployed yet.

- Read-only MCP server URL and Copy URL button.
- Expandable Codex setup guide, including Authenticate for an existing `canvas-todo` configuration and an optional terminal sign-in command.
- Expandable Claude setup guide with the individually registered public client ID, Copy client ID, and no client secret.
- Clear distinction between connecting to saved app tasks and the separate pending Canvas account integration.
- Existing connected-agent list, permissions, three-agent limit, and disconnect controls remain unchanged. No automatic approval, client registration, database migration, credential handling, or OAuth configuration changes.
- On a new Codex computer, the student still needs the registered server configuration from the team. The app does not pretend that copying the server URL alone installs it. Claude end-to-end connection testing remains pending.

Verification: all 19 CommonJS suites and the separate chat-backend suite passed. The new executable copy tests cover each exact value, an unknown key, clipboard-denial fallback, and late copy feedback after leaving Settings. Browser checks exercised the guides, keyboard activation, and copy feedback. A copied Claude client ID was pasted into a synthetic assignment form and matched exactly. No assignment was created on the live backend.

Measured CSS viewports were 1367×767 and 390×844; document width equaled viewport width. Copy controls were at least 44px tall. Screenshots use the existing synthetic preview, which does not load account settings or contact Supabase. Initial direct screenshot calls timed out; the documented screenshot wrapper produced the saved JPEG captures. No real OAuth connection was initiated during these UI checks.

[Laptop screenshot](agent-setup-20261116/laptop.jpg) · [Phone screenshot](agent-setup-20261116/phone.jpg)
