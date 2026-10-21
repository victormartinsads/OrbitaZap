# Iniciar Banco MariaDB caso não esteja em execução
$mariadbProcess = Get-Process -Name "mysqld", "mariadbd" -ErrorAction SilentlyContinue
if (-not $mariadbProcess) {
    Write-Host "Iniciando servidor de banco de dados MariaDB..." -ForegroundColor Cyan
    Start-Process -FilePath "C:\Program Files\MariaDB 13.0\bin\mysqld.exe" -ArgumentList "--console" -WindowStyle Hidden
    Start-Sleep -Seconds 2
}

Write-Host "Iniciando MarcFlow..." -ForegroundColor Green
Set-Location -Path $PSScriptRoot
npm run dev
