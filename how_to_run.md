Commands to run Academia

1. Open Terminal 1 — Frontend
   Open PowerShell in VS Code.
   cd C:\Users\GAURAV\Desktop\my_projects\Academia

$env:PATH = "$env:NVM_HOME\installs\v22.21.1;$env:PATH"

& "$env:NVM_HOME\installs\v22.21.1\npm.cmd" run dev

This starts the frontend development server. 2. Open Terminal 2 — Backend
Open another terminal in the same project folder.
cd C:\Users\GAURAV\Desktop\my_projects\Academia

.\.venv\Scripts\Activate.ps1
cd backend

uv run --active open-webui serve

This starts the backend server. 3. Open Academia
Once both servers are running, open the frontend URL shown in Terminal 1.

Usually:

http://localhost:5173
