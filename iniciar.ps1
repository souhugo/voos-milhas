# Abre o app Voos em Reais e Pontos no Windows, sem precisar de administrador.
# Na primeira vez baixa o Node.js portatil e instala as dependencias.
# Use o iniciar.bat para rodar.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Set-Location $PSScriptRoot

$runtime = Join-Path $PSScriptRoot 'runtime'
New-Item -ItemType Directory -Force $runtime | Out-Null

function Passo($texto) { Write-Host ''; Write-Host "== $texto" -ForegroundColor Cyan }

# ---------- 1. Node.js ----------
$nodeDir = $null
$instalado = Get-Command node.exe -ErrorAction SilentlyContinue
if ($instalado) {
  $nodeDir = Split-Path $instalado.Source
} else {
  $portatil = Get-ChildItem $runtime -Directory -Filter 'node-v*' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($portatil) { $nodeDir = $portatil.FullName }
}
if (-not $nodeDir) {
  Passo 'Baixando o Node.js portatil (so na primeira vez, cerca de 30 MB)...'
  $versoes = Invoke-RestMethod 'https://nodejs.org/dist/index.json'
  $v = ($versoes | Where-Object { $_.lts -and $_.version -like 'v22.*' } | Select-Object -First 1).version
  $zip = Join-Path $runtime 'node.zip'
  Invoke-WebRequest "https://nodejs.org/dist/$v/node-$v-win-x64.zip" -OutFile $zip
  Expand-Archive $zip -DestinationPath $runtime -Force
  Remove-Item $zip
  $nodeDir = Join-Path $runtime "node-$v-win-x64"
}
$env:Path = "$nodeDir;$env:Path"
$node = Join-Path $nodeDir 'node.exe'
$npm = Join-Path $nodeDir 'npm.cmd'
$npx = Join-Path $nodeDir 'npx.cmd'

# ---------- 2. Dependencias (de novo sempre que o app for atualizado) ----------
$marca = Join-Path $PSScriptRoot 'node_modules\.instalado'
$versaoApp = (Get-FileHash (Join-Path $PSScriptRoot 'package-lock.json')).Hash
if (-not (Test-Path $marca) -or (Get-Content $marca -Raw).Trim() -ne $versaoApp) {
  Passo 'Instalando o que o app precisa (alguns minutos)...'
  & $npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'A instalacao falhou (npm install). A rede pode estar bloqueando registry.npmjs.org.' }
  Set-Content $marca $versaoApp
}

# ---------- 3. Navegador ----------
$chromes = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
if (-not ($chromes | Where-Object { Test-Path $_ })) {
  # Sem Google Chrome: usa um Chromium baixado para dentro da pasta do app.
  $env:NAVEGADOR = 'chromium'
  $env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $runtime 'navegadores'
  if (-not (Test-Path $env:PLAYWRIGHT_BROWSERS_PATH)) {
    Passo 'Google Chrome nao encontrado. Baixando um navegador para o app (so na primeira vez)...'
    & $npx playwright install chromium
    if ($LASTEXITCODE -ne 0) { throw 'Nao consegui baixar o navegador.' }
  }
}

# ---------- 4. App ----------
Passo 'App rodando em http://localhost:3000'
Write-Host 'Deixe esta janela aberta (pode minimizar). Fechar a janela fecha o app.'
Start-Job { Start-Sleep 3; Start-Process 'http://localhost:3000' } | Out-Null
& $node server.js
