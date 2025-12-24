# cf_ai_robotics_advisor

AI-powered Robotics Troubleshooting Advisor built on Cloudflare Workers. It provides a chat UI that guides users through diagnosing robot issues using a staged workflow, persists conversation state in Durable Objects, and generates responses via Workers AI (Llama 3.3).

## Components
- **LLM**: Workers AI `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (see `src/index.ts`).
- **Workflow/Coordination**: Worker routes + `AdvisorState` Durable Object + `DiagnosisWorkflow` (see `src/workflow.ts`).
- **User Input (Chat)**: Minimal web UI served by `serveUI()` (see `src/index.ts`).
- **Memory/State**: Conversation history and stage stored in Durable Objects (`AdvisorState`).

## Quick Start (Deployed)
- Open the deployed Worker: https://cf-ai-robotics-advisor.khare-vayun.workers.dev
- Type a robot issue; the advisor will ask focused questions, then provide a diagnosis and solution.

## Project Structure
- `cf-ai-robotics-advisor/src/index.ts`: Worker entry, routes, chat UI, AI calls, DO interactions.
- `cf-ai-robotics-advisor/src/workflow.ts`: Stage prompts and transition logic.
- `cf-ai-robotics-advisor/wrangler.jsonc`: Wrangler config, AI binding, Durable Objects binding and migrations.
- `PROMPTS.md`: AI prompts used during development and runtime.

## Trying Each Component
- **LLM**: Send a message via the chat; the Worker calls Workers AI and returns a response.
- **Workflow**: The `DiagnosisWorkflow` switches stages from `initial` → `diagnostic` → `solution` based on conversation length and hints.
- **Chat UI**: Use the input box and Send button; messages stream into the page.
- **State**: Conversation is persisted per session ID via `AdvisorState` Durable Object.

## Notes
- Durable Objects use `new_sqlite_classes` migrations to work on free plans.
- For custom domains, add `routes` in `wrangler.jsonc` and redeploy.
