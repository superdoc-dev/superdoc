# SuperDoc - Laravel Example

A Laravel + Livewire example demonstrating how to integrate SuperDoc for editing `.docx` files in the browser.

## Prerequisites

- PHP >= 8.2
- Composer
- Node.js >= 18
- npm

## Setup

```bash
# Install PHP dependencies
composer install

# Copy environment file and generate app key
cp .env.example .env
php artisan key:generate

# Install frontend dependencies
npm install

# Run database migrations (uses SQLite by default)
php artisan migrate

# Create the public storage symlink (required for saving documents)
php artisan storage:link
```

## Running

Start the development server:

```bash
composer run dev
```

This runs concurrently:
- Laravel dev server at `http://localhost:8000`
- Vite dev server (HMR for frontend assets)
- Queue listener
- Log viewer (Pail)

Then open **http://localhost:8000/editor** in your browser.

## Usage

1. Upload a `.docx` file using the file picker
2. Edit the document in the SuperDoc editor
3. Use the toolbar buttons to:
   - **Edit Mode / View Mode** — switch between editing and viewing
   - **Export** — download the document as `.docx`
   - **Save** — save the document to the server (`storage/app/public/documents/`)

After saving, a download link appears next to the buttons.

## How it works

- **SuperDoc** is imported in `resources/js/app.js` and exposed on `window.SuperDoc`
- The editor page (`resources/views/pages/⚡editor.blade.php`) is a Livewire component that uses Alpine.js to manage the SuperDoc instance client-side
- File uploads and server-side storage are handled by Livewire's `WithFileUploads`
- Vite bundles SuperDoc and Tailwind CSS via `vite.config.js`
