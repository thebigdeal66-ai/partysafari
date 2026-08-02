# AI Agent Rules for PartySafari

This document is the permanent operating policy for every AI coding agent that works in this repository. It is intentionally strict because this codebase already contains several high-risk product surfaces: live scoring, realtime subscriptions, venue ownership, authentication, and Supabase-backed data access.

## 1. Scope and active application

- The active application is the repository-relative directory `partysafari/`.
- Work only in `partysafari/` unless the sprint explicitly concerns repository-level documentation or configuration.
- Never modify the unused root-level `src/` scaffold.
- Never treat the root `package.json` as the application manifest; the app manifest is `partysafari/package.json`.
- Use repository-relative paths whenever possible.

## 2. Required reading before any change

Before making changes, read the governing project documents:

- `MASTERPLAN.md`
- `CONTRIBUTING.md`
- `AI_CONTEXT.md`
- `PROJECT_INDEX.md`
- `SECURITY_NOTES.md`
- `PRODUCTION_RUNBOOK.md`, if present

If a document is missing, note that fact and proceed with the remaining authoritative sources.

## 3. Core working rules

- Read the governing project documents before making changes.
- Inspect the existing architecture before implementing.
- Reuse existing hooks, helpers, components, types, and contracts.
- Never duplicate business logic.
- Never create parallel scoring, recommendation, auth, realtime, or data-access systems.
- Favor adapters and incremental changes over rewrites.
- Preserve backward compatibility unless explicitly instructed otherwise.
- Preserve existing UI contracts whenever practical.
- Keep the application deployable after every commit.
- Keep changes narrowly scoped to the approved task.
- Do not modify unrelated files.
- Do not claim testing, visual review, deployment, or validation that was not actually performed.
- Report blockers, uncertainty, deviations, and known risks honestly.
- Fail closed rather than fail open for auth, permissions, flags, and data access.
- Feature flags are rollout controls only and never authorization controls.
- Database and production authorization must be enforced by RLS or another trusted server-side boundary.
- Never trust client-supplied identity for authorization.
- Avoid giant all-in-one sprints. Split work when it is likely to exceed one execution window.
- Prefer small, reviewable commits and one focused PR per sprint.
- Never commit directly to `main`.

## 4. Git and worktree safety

- Never run `git reset --hard`.
- Never run `git clean`.
- Never force-push.
- Never discard uncommitted work.
- Never overwrite local changes.
- Never stash or unstash without explicit approval.
- Never switch branches when doing so would overwrite changes.
- When another branch is needed and the current working tree is dirty, prefer creating a separate git worktree.
- Never delete a branch without explicit approval.
- Never merge a PR without explicit approval.
- Never close a PR without explicit approval.
- Never rewrite published history.
- Never amend or squash existing commits unless explicitly instructed.
- Always report the current branch, worktree path, and dirty-state risks when relevant.

## 5. Approval policy

The agent may proceed without asking for approval for low-risk, local, reversible validation work only.

### Allowed without additional approval

- Read-only repository inspection.
- Read-only GitHub inspection.
- Creating a local feature branch when explicitly requested by the sprint.
- Creating a separate local git worktree.
- Running `npm ci`.
- Running `npm install` only when it installs the versions already locked in `package-lock.json`.
- Running `npx` tools required for TypeScript, ESLint, tests, formatting, SQL parsing, or builds.
- Running TypeScript checks.
- Running ESLint.
- Running unit tests.
- Running production builds locally.
- Running local SQL syntax validation.
- Creating disposable local test databases.
- Starting disposable local PostgreSQL or Docker containers used only for validation.
- Destroying disposable test databases or containers created by the agent.
- Creating Vercel preview builds when this does not modify production or project-wide security settings.
- Adding or updating files expressly required by the approved sprint.
- Committing and pushing to the approved feature branch when the sprint explicitly instructs it.
- Opening a draft PR when the sprint explicitly instructs it.

These actions must remain local, reversible, and non-production.

### Stop and request explicit approval before

- Applying any migration to production Supabase.
- Writing to production data.
- Deleting or changing production data.
- Assigning ownership or roles in production.
- Changing RLS in production.
- Changing production functions, triggers, policies, indexes, or extensions.
- Enabling or disabling a production feature flag.
- Modifying Vercel environment variables.
- Modifying Vercel project or deployment-protection settings.
- Modifying Supabase settings.
- Modifying GitHub repository settings.
- Modifying branch-protection rules.
- Modifying billing or subscription settings.
- Modifying authentication providers or login settings.
- Requesting, viewing, copying, rotating, or exposing secrets.
- Requesting API keys, passwords, tokens, service-role keys, or private credentials.
- Installing global packages.
- Adding a new dependency.
- Upgrading, downgrading, or replacing package versions.
- Running `npm audit fix` or any broad automatic dependency update.
- Modifying `package.json` or `package-lock.json` unless explicitly authorized.
- Creating or changing a GitHub Actions workflow.
- Running destructive shell commands.
- Deleting files not explicitly approved by the sprint.
- Renaming broad sets of files.
- Moving folders.
- Removing compatibility code.
- Changing public APIs or hook contracts.
- Changing Party Score weights or semantics.
- Changing PSI thresholds.
- Changing Crowd Pulse thresholds.
- Changing AI Discover thresholds.
- Changing Lit eligibility, cooldowns, quotas, or decay.
- Changing migrations already merged.
- Stashing or unstashing work.
- Force-pushing.
- Resetting.
- Cleaning.
- Deleting branches.
- Merging PRs.
- Closing PRs.
- Deploying to production.
- Anything irreversible or difficult to roll back.
- Anything outside the approved sprint scope.

If there is uncertainty about whether an action is safe, stop and ask.

## 6. Production safety

- Live Supabase is a separate source of truth and may differ from repository migrations.
- Before any database-related implementation, audit the live schema read-only when access exists.
- Before any production database change, capture the affected policies, functions, indexes, constraints, table definitions, migration history, and rollback SQL.
- Production migrations must be separate, explicitly approved deployment sprints.
- Repository merge and production deployment are separate approvals.
- Never improvise SQL during a failed production deployment.
- If a production verification step fails, stop immediately.
- Do not continue to later steps after a failed verification.
- Never assign owners, roles, or admin permissions automatically.
- Do not capture or expose personal data in deployment reports.
- Do not store raw GPS, movement history, private messages, friend lists, or user-identifying attendance data unless explicitly designed, reviewed, and approved.
- Routine production deployment should avoid the 8:00 p.m.–2:00 a.m. Eastern Time nightlife window.
- Documentation, branch work, tests, and previews are allowed during that window.
- Emergency hotfixes and explicitly approved releases are exceptions.

## 7. PartySafari architectural boundaries

Do not modify the following without explicit task-specific approval:

- Party Score formulas, weights, or semantics.
- PSI core contracts.
- Lit Button eligibility, cooldown, rate limits, or database enforcement.
- Crowd Pulse core calculations or calibration constants.
- AI Discover thresholds and category semantics.
- Venue ownership and RLS policies.
- Authentication and identity resolution.
- Realtime kill switches.
- Production migrations.
- Public hook signatures.
- Shared UI contracts used across multiple pages.

Party Score already exists. PSI must interpret and extend it, not create a competing score. Crowd Pulse must aggregate existing venue-anchored signals and must not introduce passive location tracking. AI Discover explanations must trace to real signals. No fabricated AI claims. No predictive claims unless a real prediction model exists. Feature flags must default `OFF` unless explicitly approved otherwise.

## 8. Validation requirements

Every code sprint must run, where applicable:

- TypeScript check.
- ESLint.
- Full unit-test suite.
- Production build.
- SQL syntax validation for migrations.
- Disposable Postgres or RLS validation for security-sensitive migrations when possible.
- Mobile and desktop visual review for UI changes when access is available.

The final report must clearly distinguish:

- Passed.
- Failed.
- Blocked.
- Not run.
- Inferred but not verified.

Never describe a blocked visual review as passed. Never describe syntax validation as runtime validation. Never describe local Postgres validation as live Supabase validation. Never describe a repository merge as a production deployment.

## 9. PR and reporting requirements

Every sprint report must include:

- Branch name.
- Worktree path, if used.
- Files created.
- Files modified.
- Files intentionally not modified.
- Behavior changes.
- Architecture impact.
- Database impact.
- Production impact.
- Feature-flag impact.
- Security and privacy impact.
- TypeScript result.
- ESLint result.
- Test result.
- Build result.
- Visual QA result.
- Unresolved risks.
- Whether a migration exists.
- Whether it was applied.
- Whether a PR is draft, open, merged, or unmerged.

Draft PRs must remain unmerged until explicit approval.
