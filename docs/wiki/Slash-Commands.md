# Slash Commands

Slash commands are power-user shortcuts that expand a short prefix into a full, optimized prompt. Type `/` in the home page prompt bar to see the autocomplete menu.

---

## All Slash Commands

| Command | Label | Expands to |
|---|---|---|
| `/image <desc>` | Generate Image | `Generate an image: <desc>` |
| `/research <topic>` | Deep Research | Comprehensive multi-source research prompt with instructions to synthesize findings and create a cited report |
| `/code <task>` | Write Code | Production-quality code prompt with instructions for error handling, comments, and tests |
| `/summarize <url or topic>` | Summarize | If URL: fetch and summarize; if text: create a comprehensive summary |
| `/email <instructions>` | Draft Email | Draft a professional email |
| `/analyze <subject>` | Analyze Data | Thorough analysis prompt with instruction to create visualizations where helpful |
| `/video <desc>` | Generate Video | Generate a video using Dream Machine |
| `/scrape <url>` | Scrape Website | Extract all relevant data from a URL, structured as clean JSON or markdown |
| `/build <app desc>` | Build App | Build a complete working web application with all HTML/CSS/JS files |
| `/compare <items>` | Compare | Comparison with a table, pros/cons, and recommendation |
| `/debug <issue>` | Debug Code | Debug a code issue, explain root cause, provide corrected code |
| `/plan <goal>` | Create Plan | Comprehensive actionable plan with timeline, milestones, dependencies, and deliverables |

---

## How to Use

1. Start typing `/` in the prompt bar on the home page
2. A dropdown appears with matching commands
3. Select a command (click or arrow keys + Enter)
4. The command is inserted into the prompt bar with a placeholder
5. Complete the text after the command and submit

---

## Autocomplete Behavior

- Typing `/im` shows `/image`
- Typing `/r` shows `/research`
- Typing just `/` shows all 12 commands
- The autocomplete closes if you type something that doesn't match any command prefix

---

## Extending Slash Commands

Slash commands are defined in `src/app/computer/page.tsx` as `SLASH_COMMANDS: SlashCommand[]`. Each entry has:

```typescript
{
  command: "/mycommand",
  label: "Display Name",
  description: "Shown in the dropdown",
  icon: "🔧",
  expand: (args: string) => `Full prompt: ${args}`,
}
```

To add a custom command, add a new entry to that array and restart the dev server.
