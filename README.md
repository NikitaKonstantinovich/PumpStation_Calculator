# vinext-starter

A clean full-stack starter running on
[vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and
Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

## База данных и исходные материалы

База насосов и исходные каталоги хранятся отдельно от Git-репозитория:

- [скачать архив с Яндекс Диска](https://disk.360.yandex.ru/d/ibtEqDcrlv4tbQ)
- имя файла: `PumpStation_Calculator_data_2026-08-21.zip`
- размер: 51,9 МБ
- SHA-256: `F8F2D45650319FC4AEEB7AB61909D99F3480FFBCB437EDB4CCB62128A6D8C1DB`

Создайте общую папку проекта, клонируйте репозиторий в подпапку `frontend`,
а затем распакуйте содержимое архива рядом с ней:

```text
PumpStation_Calculator/
├── frontend/            # этот Git-репозиторий
├── database/            # pumps.sqlite, схема и скрипты импорта
└── Equipment/           # Excel/PDF/MDB — исходные материалы
```

Пример установки в PowerShell:

```powershell
New-Item -ItemType Directory PumpStation_Calculator
Set-Location PumpStation_Calculator
git clone https://github.com/NikitaKonstantinovich/PumpStation_Calculator.git frontend
Expand-Archive -LiteralPath <путь-к-архиву>\PumpStation_Calculator_data_2026-08-21.zip -DestinationPath .
Set-Location frontend
npm install
npm run dev
```

Не помещайте `database` и `Equipment` внутрь `frontend`: скрипты импорта
рассчитывают на показанную выше структуру. Готовая SQLite-база находится в
`database/pumps.sqlite`. Для её пересборки из Excel после распаковки выполните
из папки `PumpStation_Calculator`:

```powershell
python -X utf8 database/import_pumps.py
```

## Email authentication

Copy `.env.example` to `.env.local` and configure `RESEND_API_KEY`,
`EMAIL_FROM`, and `APP_BASE_URL`. In local development, when mail credentials
are absent, confirmation and password-reset links are returned in the UI for
testing. Production intentionally requires configured mail credentials.

User accounts, one-time tokens, sessions, and projects are stored in D1. Apply
the checked-in Drizzle migrations when provisioning the database; the API also
performs idempotent table initialization on first use.

This starter does not use `wrangler.jsonc`.

## Included Shape

- edit site code under `app/`
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Email and name are intended for display or contact purposes.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the starter and verify its rendered loading skeleton
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
