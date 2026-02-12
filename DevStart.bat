@echo off
echo Starting Bakabooru Development Environment...

:: Start the API
echo Launching API...
start "Bakabooru API" cmd /k "cd server && dotnet run --project Bakabooru.Server"

:: Start the Scanner
echo Launching Scanner...
start "Bakabooru Scanner" cmd /k "cd server && dotnet run --project Bakabooru.Scanner"

:: Start the Client
echo Launching Client...
start "Bakabooru Client" cmd /k "cd client && npm start"

echo All services launched in separate windows.
echo API: http://localhost:5119
echo Client: http://localhost:4200
pause
