#!/bin/bash
# Deploy backend to Google Cloud Run
# Requires: gcloud CLI authenticated with a project

set -e

echo "=== Deploying Backend to Google Cloud Run ==="
echo ""

# Configuration
SERVICE_NAME="document-api-agentic-demo"
REGION="us-central1"

# Check for .env file
if [ ! -f .env ]; then
  echo "ERROR: .env file not found"
  echo "Copy .env.example to .env and set OPENAI_API_KEY"
  exit 1
fi

# Source .env to get OPENAI_API_KEY
source .env

if [ -z "$OPENAI_API_KEY" ]; then
  echo "ERROR: OPENAI_API_KEY is not set in .env"
  exit 1
fi

# Get current GCP project
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [ -z "$PROJECT_ID" ]; then
  echo "ERROR: No GCP project set. Run: gcloud config set project YOUR_PROJECT_ID"
  exit 1
fi

echo "Project: $PROJECT_ID"
echo "Service: $SERVICE_NAME"
echo "Region: $REGION"
echo ""

# Build and push container
IMAGE="gcr.io/$PROJECT_ID/$SERVICE_NAME"
echo "Building container image: $IMAGE"
gcloud builds submit --tag "$IMAGE" --quiet

echo ""
echo "Deploying to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE" \
  --platform managed \
  --region "$REGION" \
  --allow-unauthenticated \
  --set-env-vars "OPENAI_API_KEY=$OPENAI_API_KEY" \
  --timeout 3600 \
  --session-affinity \
  --quiet

# Get the service URL
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --format 'value(status.url)')

echo ""
echo "=== Backend Deployment Complete ==="
echo ""
echo "Service URL: $SERVICE_URL"
echo ""
echo "Next steps:"
echo "1. Add this to your .env file:"
echo "   VITE_BACKEND_URL=$SERVICE_URL"
echo ""
echo "2. Deploy the frontend:"
echo "   ./deploy-frontend.sh"
