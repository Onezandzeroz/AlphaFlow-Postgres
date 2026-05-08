# Deployment Guide — AlphaFlow

Complete setup instructions for local development and production deployment on Ubuntu cloud VPS.

---

## Prerequisites

Install [Bun](https://bun.sh/docs/installation) v1.3+:

**macOS / Linux:**
```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
```

Verify installation:
```bash
bun --version
```

---

## 1. Local Development

```bash
# Clone the repository
git clone <your-repo-url>
cd AlphaFlow

# Install dependencies (generates Prisma Client automatically via postinstall)
bun install

# Initialize the database
bun run db:push

# (Optional) Configure environment variables
cp .env.example .env

# Start the development server
bun run dev
```

Open **http://localhost:3000** in your browser.

The dev server automatically:
- Checks if port 3000 is available
- Uses Webpack mode (required for Prisma compatibility with Next.js 16)
- Hot-reloads on file changes

### Email in Development

Without SMTP configuration, the email system runs in **dev mode**: emails are rendered and logged to the console but not sent. This is the default — no additional setup is required.

To test real emails during development, configure SMTP in `.env` (see [Environment Variables](#environment-variables)).

### Stopping the dev server

Press `Ctrl + C` in the terminal.

### If port 3000 is stuck

```bash
bun run kill-port
```

---

## 2. Production Deployment (Ubuntu Cloud VPS)

### 2.1. Server Setup

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install essential tools
sudo apt install -y git curl ufw

# Install Bun
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# Verify
bun --version
```

### 2.2. Clone and Install

```bash
# Clone the repository
git clone <your-repo-url>
cd AlphaFlow

# Install dependencies
bun install

# Initialize the database
bun run db:push
```

### 2.3. Configure Environment Variables

Create a `.env` file in the project root:

```bash
cp .env.example .env
nano .env
```

Edit the following values:

```env
# Database — default is fine for single-server deployment
DATABASE_URL=file:./db/custom.db

# Email / SMTP (REQUIRED for production email features)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=your-app-password
EMAIL_FROM=noreply@yourdomain.com
APP_URL=https://yourdomain.com
```

> **Important:** `APP_URL` must match your public URL. This is used for email verification links, password reset links, and team invitation links. If this is wrong, those links will point to the wrong address.

See [SMTP Provider Examples](#smtp-provider-examples) below for provider-specific settings.

### 2.4. Build and Start with PM2

```bash
# Create the production build
bun run build

# Create logs directory (required by PM2)
mkdir -p logs

# Start with PM2
bun run start:pm2

# Save the PM2 configuration so it survives reboots
pm2 save
pm2 startup
```

### 2.5. Configure Reverse Proxy (Caddy)

Caddy automatically handles HTTPS certificates via Let's Encrypt.

```bash
# Install Caddy
sudo apt install -y caddy

# Edit the Caddyfile
sudo nano /etc/caddy/Caddyfile
```

Replace the contents with:

```
yourdomain.com {
    reverse_proxy localhost:3000 {
        header_up Host {host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
        header_up X-Real-IP {remote_host}
    }
}
```

```bash
# Validate and reload Caddy
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl restart caddy
sudo systemctl enable caddy
```

Your app is now accessible at **https://yourdomain.com** with automatic HTTPS.

### 2.6. Firewall

```bash
# Allow SSH, HTTP, and HTTPS
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

---

## 3. SMTP Configuration

### SMTP Provider Examples

| Provider | SMTP Host | Port | Notes |
|---|---|---|---|
| **Gmail** | `smtp.gmail.com` | 587 | Requires [App Password](https://support.google.com/accounts/answer/185833) (not account password). Enable 2FA first. |
| **Mailgun** | `smtp.mailgun.org` | 587 | Free tier: 1,000 emails/month. Use credentials from Mailgun dashboard. |
| **SendGrid** | `smtp.sendgrid.net` | 587 | Use API key as password. Create a sender identity first. |
| **Mailtrap** | `smtp.mailtrap.io` | 587 | Testing only — emails are captured in sandbox UI. Free plan: 1,000 emails/month. |
| **Amazon SES** | `email-smtp.eu-north-1.amazonaws.com` | 587 | SES SMTP credentials from AWS console. Verify sender domain first. |
| **Microsoft 365** | `smtp.office365.com` | 587 | Requires app password or OAuth2 client credentials. |
| **Migadu** | `smtp.migadu.com` | 465 | Use your Migadu mailbox credentials. |

### Gmail Setup (Most Common for Small Businesses)

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Enable **2-Step Verification**
3. Go to **App passwords** → Create new → Select "Mail" → Generate
4. Use the 16-character app password as `SMTP_PASS`

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=abcdabcdabcdabcd  # 16-char app password
EMAIL_FROM=your@gmail.com
APP_URL=https://yourdomain.com
```

### Testing Email Configuration

After deployment, verify email is working:

1. **Register a new account** — A verification email should be sent
2. **Click "Forgot password"** — A reset email should be sent
3. **Invite a team member** — An invitation email should be sent
4. **Check PM2 logs** for `[EMAIL]` entries:
   ```bash
   pm2 logs alphaflow | grep EMAIL
   ```

If emails fail, check the `EmailLog` table in the database — failed emails will have status `failed` with an error message.

---

## 4. Updating the Deployment

When you pull new changes:

```bash
cd AlphaFlow

# Pull latest code
git pull

# Install any new dependencies
bun install

# Update database schema (if changed)
bun run db:push

# Rebuild for production
bun run build

# Restart the app
pm2 restart alphaflow
```

---

## 5. Useful PM2 Commands

| Command | Description |
|---|---|
| `pm2 status` | Show all running apps |
| `pm2 logs alphaflow` | Show live logs |
| `pm2 logs alphaflow --lines 100` | Show last 100 log lines |
| `pm2 logs alphaflow --err` | Show error logs only |
| `pm2 restart alphaflow` | Restart the app |
| `pm2 stop alphaflow` | Stop the app |
| `pm2 delete alphaflow` | Remove from PM2 |
| `pm2 monit` | Real-time monitoring dashboard |
| `pm2 save` | Save current process list |
| `pm2 startup` | Generate startup script |

---

## 6. Environment Variables Reference

All variables are set in the `.env` file in the project root.

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | No | `file:./db/custom.db` | SQLite database path |
| `SMTP_HOST` | No* | — | SMTP server hostname |
| `SMTP_PORT` | No* | `587` | SMTP port (587 = TLS, 465 = SSL) |
| `SMTP_USER` | No* | — | SMTP authentication username |
| `SMTP_PASS` | No* | — | SMTP authentication password |
| `EMAIL_FROM` | No* | `noreply@alphaai.dk` | Sender email address |
| `APP_URL` | No* | `http://localhost:3000` | Public base URL for email links |

*Not required — if any of `SMTP_HOST`, `SMTP_USER`, or `SMTP_PASS` are missing, the email system runs in dev mode (console logging only, no emails sent).

---

## 7. Database Management

The SQLite database is stored at `prisma/db/custom.db`.

### Backup the database manually

```bash
cp prisma/db/custom.db prisma/db/custom.db.backup-$(date +%Y%m%d)
```

### Restore from manual backup

```bash
pm2 stop alphaflow
cp prisma/db/custom.db.backup prisma/db/custom.db
pm2 restart alphaflow
```

### Reset the database (WARNING: deletes all data)

```bash
bun run db:push -- --force-reset
pm2 restart alphaflow
```

---

## 8. Troubleshooting

### App won't start — port in use

```bash
# Check what's using port 3000
sudo lsof -i :3000

# Kill the process
sudo kill <PID>

# Or use the built-in port killer
bun run kill-port
```

### Database errors

```bash
# Re-sync the database schema
bun run db:push

# Regenerate Prisma Client
bun run db:generate
```

### Build errors

```bash
# Clean everything and rebuild
rm -rf .next node_modules
bun install
bun run db:generate
bun run build
```

### Emails not sending

1. **Check SMTP credentials** — Verify `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` in `.env`
2. **Check PM2 logs** — `pm2 logs alphaflow | grep EMAIL`
3. **Check EmailLog table** — Query for `status: 'failed'` entries
4. **Verify APP_URL** — Must be your public URL, not `localhost`
5. **Check SMTP port** — Port 587 uses STARTTLS; port 465 uses implicit SSL
6. **Gmail specific** — Ensure you're using an App Password, not your account password

### PM2 app keeps restarting

```bash
# Check error logs
pm2 logs alphaflow --err --lines 50

# Common causes:
# 1. Database file missing  → run: bun run db:push
# 2. Port conflict         → run: bun run kill-port
# 3. Missing dependencies  → run: bun install
# 4. Invalid .env file     → check syntax (no spaces around =)
```

### Permission errors on Ubuntu

```bash
# Fix file ownership
sudo chown -R $USER:$USER /path/to/AlphaFlow
```

### Caddy HTTPS not working

```bash
# Check Caddy status
sudo systemctl status caddy

# Check Caddy logs
sudo journalctl -u caddy -f

# Validate config
sudo caddy validate --config /etc/caddy/Caddyfile

# Ensure DNS is pointing to your server IP
dig yourdomain.com
```

---

## 9. Security Checklist

Before going live, ensure:

- [ ] `.env` is configured with real SMTP credentials (not using dev mode)
- [ ] `APP_URL` matches your public domain (https)
- [ ] Firewall (ufw) allows only ports 22, 80, 443
- [ ] SSH key authentication is configured (disable password login)
- [ ] Database file (`prisma/db/custom.db`) is not publicly accessible
- [ ] PM2 startup script is saved (`pm2 save && pm2 startup`)
- [ ] Caddy is enabled (`sudo systemctl enable caddy`)
- [ ] Backups are running (check PM2 logs for `[BACKUP]` entries)
- [ ] First user is promoted to SuperDev for oversight access
