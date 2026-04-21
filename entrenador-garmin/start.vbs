' Inicia el servidor en segundo plano (sin ventana de terminal)
' Para auto-inicio con Windows: copia un acceso directo a este archivo en
'   C:\Users\TU_USUARIO\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup

Dim oFSO, oShell, strDir
Set oFSO  = CreateObject("Scripting.FileSystemObject")
Set oShell = CreateObject("WScript.Shell")

strDir = oFSO.GetParentFolderName(WScript.ScriptFullName)
oShell.Run "cmd /c """ & strDir & "\start.bat""", 0, False

Set oShell = Nothing
Set oFSO   = Nothing
