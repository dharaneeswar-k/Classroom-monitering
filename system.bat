@echo off
echo ==============================================
echo SMART CLASSROOM AI SYSTEM - STARTUP SCRIPT
echo ==============================================

echo [1/3] Setting up Node.js Backend...
cd backend
start cmd /k "npm install && npm start"
cd ..

echo [2/3] Setting up Python AI Layer...
cd ai_layer
start cmd /k "pip install flask requests schedule && python app.py"
cd ..

echo [3/3] System is running!
echo You can now open index.html in your browser.
echo.
echo Use the following to run the seeder if it's your first time:
echo cd backend ^&^& node seed_data.js
pause
