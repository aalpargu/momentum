$ErrorActionPreference = 'Stop'

$appDir = 'C:\Users\alpar\Documents\Codex\2026-08-19\kendime-bir-verimlilik-uygulamas-kodlamak-istiyorum'
$port = 5173
$url = "http://127.0.0.1:$port"
$server = Join-Path $appDir 'serve.cjs'
$distIndex = Join-Path $appDir 'dist\index.html'

function Show-StartupError([string]$message) {
    $shell = New-Object -ComObject WScript.Shell
    [void]$shell.Popup($message, 0, 'Momentum başlatılamadı', 16)
}

function Test-Port {
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $result = $tcp.BeginConnect('127.0.0.1', $port, $null, $null)
        $connected = $result.AsyncWaitHandle.WaitOne(400)
        if ($connected -and $tcp.Connected) {
            $tcp.EndConnect($result)
            $tcp.Close()
            return $true
        }
        $tcp.Close()
    } catch {}
    return $false
}

function Test-MomentumServer {
    try {
        $response = Invoke-RestMethod -Uri "$url/api/settings/gemini-key" -Method Get -TimeoutSec 2
        return $response.PSObject.Properties.Name -contains 'configured'
    } catch {
        return $false
    }
}

function Test-BuildRequired {
    if (-not (Test-Path -LiteralPath $distIndex)) { return $true }
    $buildTime = (Get-Item -LiteralPath $distIndex).LastWriteTimeUtc
    $inputs = @(
        Get-ChildItem -LiteralPath (Join-Path $appDir 'src') -File -Recurse
        Get-Item -LiteralPath (Join-Path $appDir 'package.json')
        Get-Item -LiteralPath (Join-Path $appDir 'vite.config.ts')
        Get-Item -LiteralPath (Join-Path $appDir 'tsconfig.json')
        Get-Item -LiteralPath (Join-Path $appDir 'tsconfig.app.json')
        Get-Item -LiteralPath (Join-Path $appDir 'tsconfig.node.json')
    )
    return [bool]($inputs | Where-Object { $_.LastWriteTimeUtc -gt $buildTime } | Select-Object -First 1)
}

try {
    Set-Location -LiteralPath $appDir

    if (Test-BuildRequired) {
        $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
        $build = Start-Process -FilePath $npm -ArgumentList @('run', 'build') -WorkingDirectory $appDir -WindowStyle Hidden -Wait -PassThru
        if ($build.ExitCode -ne 0) {
            Show-StartupError 'Uygulama derlenemedi. Proje klasöründe "npm.cmd run build" komutunu çalıştırıp hata çıktısını kontrol et.'
            exit 1
        }
    }

    if (-not (Test-MomentumServer)) {
        if (Test-Port) {
            Show-StartupError "5173 portu başka veya eski bir uygulama tarafından kullanılıyor. İlgili süreci kapatıp Momentum kısayolunu yeniden aç."
            exit 1
        }

        $node = (Get-Command node.exe -ErrorAction Stop).Source
        Start-Process -FilePath $node -ArgumentList @($server) -WorkingDirectory $appDir -WindowStyle Hidden

        $ready = $false
        for ($index = 0; $index -lt 100; $index += 1) {
            Start-Sleep -Milliseconds 100
            if (Test-MomentumServer) { $ready = $true; break }
        }
        if (-not $ready) {
            Show-StartupError 'Güvenli Momentum sunucusu 10 saniye içinde başlatılamadı.'
            exit 1
        }
    }

    Start-Process $url
} catch {
    Show-StartupError $_.Exception.Message
    exit 1
}
