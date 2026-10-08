# Portfolio Site

Jonathan Behrens' personal portfolio for mechanical engineering recruiters.
The site is a Next.js 16 app on Vercel. The text, images, and files live in
Vercel Blob storage, not in this repo, and the owner changes them in the admin
page (`/admin`).

The plan for this site is in the owner's vault:
`20-projects/project-portfolio/plans/2026-10-08-1247-feat-portfolio-site-plan.md`.

## Accounts

| Account | What it is for |
|---|---|
| GitHub (personal) | Holds this repo. The `626Labs-Software` account is a collaborator, so the workspace container can push. |
| Vercel (personal, Hobby) | Builds and hosts the site. A push to `main` deploys it. |
| Vercel Blob | Two stores: one for Production, one for Preview and Development. They hold the site content and files. |
| Clerk | Signs the owner in to the admin page. Sign-ups are off; only the owner's user exists. |

## Environment variables

`.env.example` lists every variable and what it does. For local work, copy it
to `.env.local` and fill in the **Development** values from the Vercel
dashboard (Project -> Settings -> Environment Variables).

WARNING: Do not put Production values in `.env.local`. Local tests would then
change the live site.

## Commit author

Every commit must have the author `Jonathan Behrens <jbehrens702@gmail.com>`.
Vercel's Hobby plan blocks a deploy when the commit author is not the owner of
the Vercel account. The repo's local git config sets this author.

CAUTION: Do not use the GitHub merge button. Its merge commit can carry another
author, and Vercel then blocks the deploy. Fast-forward `main` instead.

## Run, test, and build

All commands run in the `dev-env` container. From Git Bash on the host:

```bash
MSYS_NO_PATHCONV=1 docker exec -w /workspace/projects/portfolio-site dev-env npm run dev
MSYS_NO_PATHCONV=1 docker exec -w /workspace/projects/portfolio-site dev-env npm run typecheck
MSYS_NO_PATHCONV=1 docker exec -w /workspace/projects/portfolio-site dev-env npm run lint
MSYS_NO_PATHCONV=1 docker exec -w /workspace/projects/portfolio-site dev-env npm test
MSYS_NO_PATHCONV=1 docker exec -w /workspace/projects/portfolio-site -e PLAYWRIGHT_BROWSERS_PATH=/workspace/tools/playwright/browsers dev-env npm run e2e
MSYS_NO_PATHCONV=1 docker exec -w /workspace/projects/portfolio-site dev-env npm run build
```

The dev server in Docker on Windows does not see file changes. Restart it
after each change.

## Deploy

Push `main` to GitHub. Vercel builds it. Check that the deployment state is
`READY` in the Vercel dashboard. If the state is `BLOCKED`, the commit author is
wrong (see "Commit author").
