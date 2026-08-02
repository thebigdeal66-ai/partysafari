# Copilot instructions for PartySafari

Follow the full repository policy in [AI_AGENT_RULES.md](../AI_AGENT_RULES.md) for complete rules.

## Default operating rules

- Treat [partysafari/](../partysafari) as the active application. Do not modify the unused root-level [src/](../src) scaffold.
- Read the governing project documents before changing code: [MASTERPLAN.md](../MASTERPLAN.md), [CONTRIBUTING.md](../CONTRIBUTING.md), [AI_CONTEXT.md](../AI_CONTEXT.md), [PROJECT_INDEX.md](../PROJECT_INDEX.md), and [SECURITY_NOTES.md](../SECURITY_NOTES.md).
- Reuse existing hooks, helpers, components, and shared logic instead of creating parallel implementations.
- Keep changes narrow, backward-compatible, and reviewable.
- Do not change application behavior, database schemas, Supabase, dependencies, or production settings unless the sprint explicitly authorizes it.
- Fail closed for auth, permissions, flags, and data access.
- Never trust client-supplied identity for authorization.
- Avoid risky Git operations; do not reset, force-push, clean, or overwrite local changes.
- Do not claim validation, deployment, or PR completion without actually running the relevant checks.
