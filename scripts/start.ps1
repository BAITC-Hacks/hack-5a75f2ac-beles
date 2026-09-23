$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)

if (-not (Test-Path -LiteralPath '.env')) {
    Copy-Item -LiteralPath '.env.example' -Destination '.env'
}

$bundledRuntime = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $bundledRuntime 'bin\node.exe' }
if (-not (Test-Path -LiteralPath $nodePath)) {
    Write-Host 'Install Node.js 24 from https://nodejs.org then run start.cmd again.'
    exit 1
}
$nodeVersion = & $nodePath --version
if ([version]$nodeVersion.TrimStart('v') -lt [version]'24.0.0') { throw 'Node.js 24 or newer is required.' }
$env:PATH = (Split-Path -Parent $nodePath) + [IO.Path]::PathSeparator + $env:PATH

$pnpmPath = Join-Path $bundledRuntime 'node_modules\pnpm\bin\pnpm.cjs'
$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (Test-Path -LiteralPath $pnpmPath) {
    & $nodePath $pnpmPath install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
    & $nodePath $pnpmPath run build
} elseif ($npmCommand) {
    & $npmCommand.Source exec --yes --package=pnpm@11.19.0 -- pnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
    & $npmCommand.Source exec --yes --package=pnpm@11.19.0 -- pnpm run build
} else {
    throw 'Install Node.js 24 with npm from https://nodejs.org.'
}
if ($LASTEXITCODE -ne 0) { throw 'Build failed. See the error above.' }
Write-Host 'Open http://localhost:3000 in your browser. Keep this window open. Ctrl+C stops the app.'
Write-Host 'Set OPENAI_API_KEY in .env and restart this script to enable AI matching.'
& $nodePath --env-file=.env server.ts
exit $LASTEXITCODE
