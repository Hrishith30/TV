# Simple IPTV Player (Xtream Codes)

A single-page Xtream Codes player — plain HTML/CSS/JS, no build step.
Live TV, movies and series with HLS playback, favorites, EPG, and TV D-pad navigation.

```
index.html            UI
app.js                app logic (API, grid, player)
style.css             styles
proxy-config.json     optional default proxy URL for this deployment
local_proxy_server.js optional same-network proxy + static server (Node, no deps)
api/proxy.js          optional serverless proxy for Vercel
.github/workflows/    GitHub Pages deploy
```

## Why login fails on a static host

The provider is often **HTTP-only**, while GitHub Pages is **HTTPS**. A browser
refuses to let an HTTPS page call an HTTP URL (mixed content), and GitHub Pages
cannot run `/api/proxy` because it serves files only. So the app needs one of:

1. **An HTTPS host from your provider** — the app automatically tries the
   panel's HTTPS ports (`443`, `2083`, `2096`) before anything else, so many
   providers just work with no proxy.
2. **A proxy over HTTPS on your own machine/network** — set it in the
   *Proxy URL* field on the login screen (see below).

## Deploy to GitHub Pages

The workflow in `.github/workflows/pages.yml` publishes `index.html`, `app.js`,
`style.css` and `proxy-config.json`.

1. Push to `main` or `master`.
2. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Open `https://<user>.github.io/<repo>/`. (Custom domain: add a `CNAME` file.)

`vercel.json` and `api/` are ignored by this workflow, so Vercel deployment still
works exactly as before if you keep using it.

## Setting the proxy URL

Three ways, highest priority first:

| How | Example |
| --- | --- |
| Login screen **Proxy URL** field (saved with "Remember me") | `https://iptv-proxy.example.com` |
| `?proxy=` query parameter | `.../TV/?proxy=https://iptv-proxy.example.com` |
| `proxy-config.json` committed next to `index.html` | `{ "proxy": "https://iptv-proxy.example.com" }` |

The app calls `<proxy>/api/proxy?target=<url>`, and the proxy must return the
provider response (JSON, HLS with rewritten segment URLs, or video bytes with
`Range` support) plus `Access-Control-Allow-Origin: *`.

## Running the proxy from home

`local_proxy_server.js` serves the app **and** `/api/proxy` from your own IP,
which is the IP your provider already allows:

```bash
node local_proxy_server.js       # http://localhost:8000
```

Open `http://<laptop-ip>:8000` on the same WiFi — that alone fixes playback, but
it is plain HTTP. To use it from the GitHub Pages site, expose it over HTTPS with
a tunnel and put that URL in the *Proxy URL* field:

```bash
cloudflared tunnel --url http://localhost:8000      # or: ngrok http 8000
```

The app then runs from `https://<user>.github.io` while all API and video
requests go through the tunnel to your home IP. Keep the tunnel URL private —
`local_proxy_server.js` proxies any URL it is given.

> Video through a tunnel is bandwidth-bound on your home upload speed.
