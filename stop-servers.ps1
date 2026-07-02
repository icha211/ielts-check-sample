$targets = @('data_storage_server.py', 'ai_review_server.py')
$pattern = ($targets | ForEach-Object { [regex]::Escape($_) }) -join '|'

Get-CimInstance Win32_Process |
  Where-Object {
    $_.Name -match '^pythonw?\.exe$' -and
    $_.CommandLine -match $pattern
  } |
  ForEach-Object {
    try {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop
      Write-Host "Stopped PID $($_.ProcessId): $($_.CommandLine)"
    } catch {
      Write-Warning "Failed to stop PID $($_.ProcessId): $($_.Exception.Message)"
    }
  }
