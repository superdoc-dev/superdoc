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
