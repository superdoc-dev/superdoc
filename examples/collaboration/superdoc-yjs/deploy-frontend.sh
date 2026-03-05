#!/bin/bash
# Deploy frontend to Cloudflare Pages
# Run this AFTER deploy-backend.sh and set VITE_BACKEND_URL in .env

set -e

echo "=== Deploying Frontend to Cloudflare Pages ==="
echo ""

# Check if .env exists and has backend URL
if [ -f .env ]; then
  source .env
  if [ -z "$VITE_BACKEND_URL" ]; then
    echo "WARNING: VITE_BACKEND_URL is not set in .env"
    echo "The frontend will not be able to connect to the backend."
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      echo "Aborted. Set VITE_BACKEND_URL in .env first."
      exit 1
    fi
  else
    echo "Backend URL: $VITE_BACKEND_URL"
  fi
else
  echo "WARNING: .env file not found"
  echo "Copy .env.example to .env and set VITE_BACKEND_URL"
  exit 1
fi

echo ""
echo "Building Vue client..."
npm run build

echo ""
echo "Deploying to Cloudflare Pages..."
npx wrangler pages deploy dist --project-name document-api-agentic-demo

echo ""
echo "=== Frontend Deployment Complete ==="
