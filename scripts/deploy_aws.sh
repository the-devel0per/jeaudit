#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="${1:-je-guard}"
REGION="${2:-us-east-1}"
GEMINI_API_KEY="${3:-}"

echo "=== JE Guard AWS Lambda Deployment ==="

# 1. Check AWS credentials
echo "[1/5] Checking AWS credentials..."
aws sts get-caller-identity --output table

# 2. Deploy SAM Stack
echo "[2/5] Building and deploying SAM container stack..."
cd "$(dirname "$0")/../infra"
sam build
sam deploy \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --capabilities CAPABILITY_IAM \
  --resolve-s3 \
  --resolve-image-repos \
  --parameter-overrides "GeminiApiKey=$GEMINI_API_KEY FrontendOrigin=http://localhost:5173"

# 3. Get outputs
echo "[3/5] Retrieving CloudFormation outputs..."
API_URL=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text)
SITE_URL=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query "Stacks[0].Outputs[?OutputKey=='SiteUrl'].OutputValue" --output text)
FRONTEND_BUCKET=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query "Stacks[0].Outputs[?OutputKey=='FrontendBucketName'].OutputValue" --output text)

echo "API URL: $API_URL"
echo "Site URL: $SITE_URL"
echo "Frontend Bucket: $FRONTEND_BUCKET"

# 4. Build and sync frontend
echo "[4/5] Building frontend..."
cd ../frontend
VITE_API_URL="$API_URL" npm run build

echo "[5/5] Uploading frontend to S3..."
aws s3 sync dist "s3://$FRONTEND_BUCKET" --delete

echo "Redeploying SAM template with CORS FrontendOrigin=$SITE_URL..."
cd ../infra
sam deploy \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --capabilities CAPABILITY_IAM \
  --resolve-s3 \
  --resolve-image-repos \
  --parameter-overrides "GeminiApiKey=$GEMINI_API_KEY FrontendOrigin=$SITE_URL"

echo "=== Deployment Complete ==="
echo "Live app URL: $SITE_URL"

