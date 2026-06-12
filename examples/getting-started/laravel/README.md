# SuperDoc — Laravel Example

Minimal Laravel + Blade + Vite example showing how to integrate SuperDoc.

## Prerequisites

- PHP >= 8.2
- Composer
- Node.js >= 18

## Setup

```bash
composer install
cp .env.example .env
php artisan key:generate
npm install
```

## Running

```bash
# In one terminal
php artisan serve

# In another terminal
npm run dev
```

Open **http://localhost:8000** — pick a `.docx` file and SuperDoc renders it.

## Fonts

SuperDoc's bundled fallback fonts (Carlito for Calibri, and more) are served from `public/fonts/`. `copy-fonts.mjs` copies them out of the installed package before the Vite build. That's the self-host approach. A simpler option for a Vite app is to install [`@superdoc/fonts`](https://docs.superdoc.dev/getting-started/fonts) and pass `fonts: superdocFonts`, which lets Vite emit the fonts with no copy step.
