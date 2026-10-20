# Deploying on an LXC container

The site runs as two Docker containers (the website and its Postgres database) started by
`docker-compose.yml`. These steps assume a Proxmox LXC with Debian 12, but any Linux host with Docker works.

## 1. Create the container

In Proxmox, create a Debian 12 container (2 GB RAM, 2 cores and 10 GB disk are plenty) and enable the
features Docker needs:

```bash
# On the Proxmox host (replace 120 with your container's id)
pct set 120 --features nesting=1,keyctl=1
pct reboot 120
```

Inside the container, install Docker and git:

```bash
apt update && apt install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sh
```

## 2. Give the container read access to the private repo

Use a **deploy key**: an SSH key that can only read this one repository.

```bash
ssh-keygen -t ed25519 -C "balala.pro deploy" -f ~/.ssh/balala_deploy -N ""
cat ~/.ssh/balala_deploy.pub
```

On GitHub: **Acher0s/balala.pro → Settings → Deploy keys → Add deploy key**, paste the key, and leave
"Allow write access" off. Then tell SSH to use it for GitHub and clone:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/balala_deploy
  IdentitiesOnly yes
EOF

git clone git@github.com:Acher0s/balala.pro.git /opt/balala
cd /opt/balala
```

## 3. Discord login

1. Go to https://discord.com/developers/applications → **New Application**.
2. Under **OAuth2**, copy the **Client ID** and **Client Secret**.
3. Under **OAuth2 → Redirects**, add `https://<your-domain>/api/auth/discord/callback`.

## 4. Settings

```bash
cp .env.example .env
nano .env
```

| Setting | Value |
| --- | --- |
| `SITE_URL` | The public address, e.g. `https://balala.pro` (no trailing slash) |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | From step 3 |
| `ADMIN_DISCORD_IDS` | Your Discord user id (Discord → Settings → Advanced → Developer Mode, then right-click your name → Copy User ID). You become admin on your first sign-in |
| `POSTGRES_PASSWORD` | A long random password, e.g. from `openssl rand -base64 24` |

## 5. Start it

```bash
docker compose up -d --build
docker compose logs -f web   # Ctrl+C to stop following
```

The first start creates the database tables and imports the guides in `content/guides/`. The site listens
on port 3000.

## 6. HTTPS

Put a reverse proxy in front that terminates HTTPS and forwards to `http://<lxc-ip>:3000`.

- **Already have one** (Nginx Proxy Manager, Traefik, Caddy on another machine): add a proxy host for your
  domain pointing at the container's IP, port 3000.
- **Otherwise**, Caddy on the container gets certificates automatically. Point your domain's DNS at the
  container (or forward ports 80 and 443 to it), then:

  ```bash
  apt install -y caddy
  printf 'balala.pro {\n  reverse_proxy localhost:3000\n}\n' > /etc/caddy/Caddyfile
  systemctl reload caddy
  ```

Sign in at `https://<your-domain>/login` with the Discord account from `ADMIN_DISCORD_IDS`.

## Updating

```bash
cd /opt/balala
git pull
docker compose up -d --build
```

Database changes (migrations) are applied automatically when the new version starts.

## Backups

Everything (accounts, guides, tier lists, uploaded images) is in the Postgres database:

```bash
# Back up
docker compose exec -T db pg_dump -U bmp bmp_university | gzip > backup-$(date +%F).sql.gz

# Restore into an empty database
gunzip -c backup-2026-10-21.sql.gz | docker compose exec -T db psql -U bmp bmp_university
```

Proxmox's own container backups (vzdump) also include the database volume.

## Updating the card data

Card sprites and text are imported from a Balatro install, which the server doesn't have. When the game or
the Multiplayer mod updates, run `npm run import-game` on a PC with the game installed, commit the changes
in `public/game/` and `src/data/game.generated.json`, push, and update the server as above.
