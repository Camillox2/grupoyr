Option Explicit

Dim shell
Set shell = CreateObject("WScript.Shell")
shell.Run """C:\Python314\pythonw.exe"" ""C:\Users\vitor\.gemini\antigravity\scratch\crm-grupoyr\start_crm.py""", 0, False
