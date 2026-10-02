# Deploying PralayDrishti

- **Backend** → Docker image on Docker Hub → **Render** (plus a Render Postgres, and optionally Render Key Value = Redis)
- **Frontend** → **Vercel** (from the `frontend/` folder of the GitHub repo)

Vercel forwards every `/api/...` request to the Render backend, so the browser only ever talks to the Vercel URL.
That keeps login cookies working and needs no CORS setup.

---

## 1. Backend image → Docker Hub

Docker Hub names must be lowercase and start with your username: `<your-username>/sihproject:1.0.0`.
Run these from the repository root:

```bash
docker login
```

```bash
docker build -t <your-username>/sihproject:1.0.0 .
```

```bash
docker push <your-username>/sihproject:1.0.0
```

New version later: build and push with a new tag (`1.0.1`, ...) and update the image tag on Render.

Test the image locally first (starts it with its own Postgres and Redis), then open http://localhost:8080:

```bash
docker compose up --build
```

## 2. Backend → Render

1. **New → Postgres.** Name `pralaydrishti-db`, database `pralaydrishti`. Copy its **Internal Database URL**.
2. *(optional)* **New → Key Value** (Redis). Copy its **Internal Key Value URL**.
3. **New → Web Service → Existing Image**, image URL `docker.io/<your-username>/sihproject:1.0.0`.
   Same region as the database. Health check path: `/health/live`.
4. Environment variables:

| Key | Value |
|---|---|
| `DATABASE_URL` | the Postgres Internal Database URL |
| `REDIS_URL` | the Key Value Internal URL (skip if no Redis) |
| `Jwt__Secret` | any random text, 32+ characters (click *Generate*) |
| `Seed__DemoUsers__0__Password` | `Demo@12345` |
| `Seed__DemoUsers__1__Password` | `Demo@12345` |
| `Seed__DemoUsers__2__Password` | `Demo@12345` |
| `ForwardedHeaders__TrustAllProxies` | `true` |

5. Deploy. When it's live, `https://<your-app>.onrender.com/health/ready` should say `Healthy`.

(`render.yaml` in the repo does steps 1-4 in one go via **New → Blueprint** if you prefer.)

The demo buttons on the login page use `Demo@12345`; if you choose other demo passwords, the buttons won't work.

## 3. Frontend → Vercel

1. In `frontend/vercel.json`, replace every `YOUR-RENDER-APP.onrender.com` with your Render URL. Commit and push.
2. Vercel → **Add New → Project** → import the GitHub repo.
3. Set **Root Directory** to `frontend`. Everything else is read from `vercel.json`. Deploy.
4. Open the Vercel URL and sign in with a demo account.

## Things to know

- **Render free plan** sleeps after 15 min idle (first request then takes ~1 min) and has 512 MB RAM - enough to
  click around, tight for large simulations. For the demo use *Starter* or bigger. Open the site a minute before
  presenting so it is awake.
- **Render free Postgres expires after 30 days.** Upgrade it, or use a Neon/Supabase URL as `DATABASE_URL`.
- **Simulation result files live on the container's disk** and are wiped on each redeploy (run history in the
  database survives). A Render *Disk* mounted at `/app/data/runs` keeps them.
- The backend image also contains the website, so `https://<your-app>.onrender.com` works on its own too - Vercel is optional.
- API docs: `/swagger`. Health: `/health/live`, `/health/ready`.
