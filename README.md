# Dapur Aman by Nexara

[Bahasa Indonesia](README.id.md)

A phone-first food-safety assistant for MBG (Makan Bergizi Gratis) kitchens.

Built by team **Nexara Vision** for the **Agentic AI Hackathon 2026**, part of ITB Hackathon Series 2026 (21–23 October 2026).

> Work in progress. Code is written during the 24-hour hacking window (21–22 October 2026).

See the [development guide](DEVELOPMENT.md) for structure, responsibilities, and collaboration agreements.

## Run locally

Needs [Bun](https://bun.sh) 1.4 or later, Node.js 24 and [uv](https://docs.astral.sh/uv/) (uv installs Python 3.13 itself). Bun installs the frontend packages from `frontend/bun.lock`; do not use npm or pnpm. Next.js still runs on Node, so `node` must be on your PATH. On NixOS, run the frontend commands inside `nix shell nixpkgs#nodejs_24`.

**Backend** (http://localhost:8000):

```
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

Check: http://localhost:8000/health returns `{"status":"ok"}`.

**Frontend** (http://localhost:3000):

```
cd frontend
bun install --frozen-lockfile
bun run dev
```

Before a push, run `bun run lint` and `bun run build`.

**Environment:** copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env.local`, then fill in values locally. Never commit them.

**Shared models:** `backend/agents/contract.py`; a static example is in `backend/agents/examples/inspection_outcome.json`. Once the backend has API schemas, generate frontend types with the backend running: `bunx openapi-typescript http://localhost:8000/openapi.json -o lib/api-types.ts` (inside `frontend/`). Never edit the generated file by hand.

## Team

| Name   | Role                | What the role covers                                   |
| ------ | ------------------- | ------------------------------------------------------ |
| Rabab  | Hustler (team lead) | Business side: product strategy, pitch, team coordination |
| Zayed  | Hacker              | Builds the product: code, AI and back end              |
| Finiko | Hipster             | Designs the user experience: interface and front end   |
| Rohmat | Hacker              | Builds the product: code, AI and back end              |

## Use of AI tools

The event rules allow AI coding assistants and generative models. The tools and models we use, and the parts they helped with, are listed here by the code freeze.

## License

[MIT](LICENSE)
