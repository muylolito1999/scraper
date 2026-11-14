param(
    [string]$MaterialsRoot = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)),
    [string]$PythonPath = ""
)
$ErrorActionPreference = "Stop"
$MaterialsRoot = (Resolve-Path -LiteralPath $MaterialsRoot).Path
if (-not $PythonPath) {
    $PythonPath = (& python -c "import sys; print(sys.executable)").Trim()
}
$PythonPath = (Resolve-Path -LiteralPath $PythonPath).Path
$PythonWindowless = Join-Path (Split-Path -Parent $PythonPath) "pythonw.exe"
if (Test-Path -LiteralPath $PythonWindowless) { $PythonPath = $PythonWindowless }
$SyncScript = Join-Path $PSScriptRoot "sync_graphics.py"
if (-not (Test-Path -LiteralPath (Join-Path $MaterialsRoot "Generatore\genera_grafiche.py"))) {
    throw "Generatore locale mancante in $MaterialsRoot"
}
$TaskName = "Grafiche Rugby - Sincronizzazione GitHub"
$TaskUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$TaskArgs = '"' + $SyncScript + '" --root "' + $MaterialsRoot + '"'
$Action = New-ScheduledTaskAction -Execute $PythonPath -Argument $TaskArgs -WorkingDirectory $MaterialsRoot
# Poll locally to catch delayed GitHub Actions and recover when the PC returns.
# No wake timer and no credential: the repository is public.
$Periodic = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 10)
$Login = New-ScheduledTaskTrigger -AtLogOn -User $TaskUser
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
$Principal = New-ScheduledTaskPrincipal -UserId $TaskUser -LogonType Interactive -RunLevel Limited
$Task = New-ScheduledTask -Action $Action -Trigger @($Periodic, $Login) -Settings $Settings -Principal $Principal -Description "Dopo l'estrazione FIR del giovedi alle 15:00 Europe/Rome scarica il CSV da GitHub e genera i PNG locali. Controlla ogni 10 minuti e all'accesso; log in Grafiche-Rugby\Log."
Register-ScheduledTask -TaskName $TaskName -InputObject $Task -Force | Out-Null
Get-ScheduledTask -TaskName $TaskName | Select-Object TaskName, State
Get-ScheduledTaskInfo -TaskName $TaskName | Select-Object NextRunTime, LastTaskResult
