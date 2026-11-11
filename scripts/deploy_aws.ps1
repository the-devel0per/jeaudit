<#
.SYNOPSIS
    Deploys JE Guard backend to AWS Lambda and frontend to S3/CloudFront.
.DESCRIPTION
    Automates building the container, deploying the Serverless Application Model (SAM) stack,
    configuring the Gemini API Key, and syncing frontend assets to S3.
#>

[CmdletBinding()]
param(
    [string]$StackName = "je-guard",
    [string]$Region = "us-east-1",
    [string]$GeminiApiKey = ""
)

$ErrorActionPreference = "Stop"

Write-Host "=== JE Guard AWS Lambda Deployment ===" -ForegroundColor Cyan

# 1. Check AWS Credentials
Write-Host "`n[1/5] Checking AWS credentials..." -ForegroundColor Yellow
try {
    $caller = aws sts get-caller-identity --output json | ConvertFrom-Json
    Write-Host "Logged in as: $($caller.Arn) (Account: $($caller.Account))" -ForegroundColor Green
} catch {
    Write-Error "AWS credentials not detected. Run 'aws configure' or 'aws login' first."
    exit 1
}

# 2. Check Prerequisites
Write-Host "`n[2/5] Checking deployment tools..." -ForegroundColor Yellow
$samAvailable = $null -ne (Get-Command "sam" -ErrorAction SilentlyContinue)
$dockerAvailable = $null -ne (Get-Command "docker" -ErrorAction SilentlyContinue)

if (-not $samAvailable -and -not $dockerAvailable) {
    Write-Host "Warning: Neither SAM CLI nor Docker CLI was found on PATH." -ForegroundColor Red
    Write-Host "Install AWS SAM CLI (https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)"
    Write-Host "and Docker Desktop to build the container image."
    exit 1
}

# 3. Deploy Backend via SAM
Write-Host "`n[3/5] Building and deploying backend to AWS Lambda via SAM..." -ForegroundColor Yellow
Push-Location "$PSScriptRoot\..\infra"
try {
    sam build
    sam deploy `
        --stack-name $StackName `
        --region $Region `
        --capabilities CAPABILITY_IAM `
        --resolve-s3 `
        --resolve-image-repos `
        --parameter-overrides "GeminiApiKey=$GeminiApiKey FrontendOrigin=http://localhost:5173"
} finally {
    Pop-Location
}

# 4. Retrieve Outputs
Write-Host "`n[4/5] Retrieving CloudFormation Stack Outputs..." -ForegroundColor Yellow
$outputs = aws cloudformation describe-stacks --stack-name $StackName --region $Region --query "Stacks[0].Outputs" --output json | ConvertFrom-Json

$apiUrl = ($outputs | Where-Object { $_.OutputKey -eq "ApiUrl" }).OutputValue
$siteUrl = ($outputs | Where-Object { $_.OutputKey -eq "SiteUrl" }).OutputValue
$frontendBucket = ($outputs | Where-Object { $_.OutputKey -eq "FrontendBucketName" }).OutputValue

Write-Host "API URL: $apiUrl" -ForegroundColor Green
Write-Host "Site URL: $siteUrl" -ForegroundColor Green
Write-Host "Frontend Bucket: $frontendBucket" -ForegroundColor Green

# 5. Build and Deploy Frontend
Write-Host "`n[5/5] Building frontend and deploying to S3..." -ForegroundColor Yellow
Push-Location "$PSScriptRoot\..\frontend"
try {
    $env:VITE_API_URL = $apiUrl
    npm run build
    if ($frontendBucket) {
        Write-Host "Syncing dist/ to s3://$frontendBucket..." -ForegroundColor Yellow
        aws s3 sync dist "s3://$frontendBucket" --delete
        Write-Host "`nRedeploying SAM stack with updated FrontendOrigin=$siteUrl..." -ForegroundColor Yellow
        Push-Location "$PSScriptRoot\..\infra"
        sam deploy `
            --stack-name $StackName `
            --region $Region `
            --capabilities CAPABILITY_IAM `
            --resolve-s3 `
            --resolve-image-repos `
            --parameter-overrides "GeminiApiKey=$GeminiApiKey FrontendOrigin=$siteUrl"
        Pop-Location
    }
} finally {
    Pop-Location
}

Write-Host "`n Deployment complete!" -ForegroundColor Green
Write-Host "Your JE Guard app is live at: $siteUrl" -ForegroundColor Cyan

