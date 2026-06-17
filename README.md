# Welcome to your Lovable project

## Regression Prevention (read first)

AccountancyOS uses a layered safety net to catch drift in critical workflows:

- [`docs/critical-workflows.md`](./docs/critical-workflows.md) — end-to-end definition of every business-critical flow (auth, portal, email queue, questionnaires, filings, RLS, etc.).
- [`docs/supabase-infrastructure.md`](./docs/supabase-infrastructure.md) + [`infra/supabase-manifest.json`](./infra/supabase-manifest.json) — expected backend infrastructure (edge functions, cron, secrets, RLS tables, email config).
- [`docs/change-checklist.md`](./docs/change-checklist.md) — required checklist for every change. Mirrored in `.github/PULL_REQUEST_TEMPLATE.md`.
- [`docs/test-fixtures.md`](./docs/test-fixtures.md) — deterministic seeded users. Real users (e.g. live clients) are never used as regression subjects.

### Commands

```bash
bun test         # Vitest regression suite (frontend + manifest contracts)
bun smoke        # Post-deploy smoke test against the live backend
```

Both must pass before shipping. The smoke script fails loudly when any edge function, cron job, table, or auth wiring is missing.

## Project info

**URL**: https://lovable.dev/projects/484d38ef-d5f4-4a95-9b44-cfbcba7d7c13

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/484d38ef-d5f4-4a95-9b44-cfbcba7d7c13) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/484d38ef-d5f4-4a95-9b44-cfbcba7d7c13) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
