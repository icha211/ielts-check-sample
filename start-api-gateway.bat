@echo off
REM Start the FastAPI gateway server on port 8000
REM This script assumes Python and FastAPI are installed in the .venv

cd /d "%~dp0"

echo Starting API Gateway server on http://localhost:8000...
echo.

REM Activate virtual environment if it exists
if exist ".venv\Scripts\activate.bat" (
    call .venv\Scripts\activate.bat
)

REM Install dependencies if not already installed
pip install fastapi uvicorn python-multipart boto3 pydantic pydantic-settings -q

REM Start the server
cd apps\api-gateway
uvicorn main:app --host 127.0.0.1 --port 8000 --reload

pause
