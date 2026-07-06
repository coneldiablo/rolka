param(
  [string]$Service = "db",
  [string]$Database = "rolka",
  [string]$User = "postgres",
  [string]$OutputDir = "backups"
)

$ErrorActionPreference = "Stop"

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$containerId = docker compose ps -q $Service
if (-not $containerId) {
  throw "Postgres service '$Service' is not running."
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$tmpFile = "/tmp/rolka-$timestamp.dump"
$outputFile = Join-Path $OutputDir "rolka-$timestamp.dump"

docker compose exec -T $Service pg_dump -U $User -d $Database --format=custom --file=$tmpFile
docker cp "${containerId}:$tmpFile" $outputFile
docker compose exec -T $Service rm -f $tmpFile

Write-Host "Backup saved to $outputFile"
