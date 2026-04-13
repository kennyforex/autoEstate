# Avatar Upload Debug Guide

## Changes Made

I've added comprehensive logging to both frontend and backend to help diagnose the upload issue:

### Frontend Changes (`ProfileSettings.tsx`)
- Added detailed error logging with error message, response data, and status code
- Added console logs before upload showing file size, type, and base64 length
- Enhanced error alert to show the actual error message from the server

### Backend Changes (`upload.routes.ts`)
- Added logging when upload request is received
- Logs user email, request body keys
- Logs MIME type and base64 length
- Added success/failure emoji indicators for easy identification

### Environment
- Created `/path/to/foodflow/frontend/.env` with:
  ```
  VITE_API_URL=http://localhost:3001/api
  VITE_SOCKET_URL=http://localhost:3001
  ```

## How to Debug the Issue

### Step 1: Check Current State
1. Open browser developer console (F12 or Cmd+Option+I)
2. Go to Console tab
3. Check backend terminal logs

### Step 2: Try Upload Again
1. Go to Settings → Profile
2. Click the camera icon or "Upload" button
3. Select an image (JPG, PNG, GIF, or WebP, max 2MB)
4. Watch the console and backend logs

### Step 3: Check for Common Issues

#### Browser Console Errors
Look for:
- Network errors (ERR_CONNECTION_REFUSED, ERR_NETWORK, etc.)
- CORS errors
- 401 Unauthorized (token expired)
- 500 Internal Server Error

#### Backend Terminal Logs
Look for:
- `📸 Image upload request received` - confirms request reached backend
- Error messages with ❌ indicator
- Authentication errors

### Common Issues and Solutions

#### Issue 1: Frontend doesn't reload with new changes
**Solution**: Restart the frontend dev server
```bash
# Kill existing process
lsof -ti :5173 | xargs kill -9
# Restart
cd /path/to/foodflow/frontend && npm run dev
```

#### Issue 2: CORS Error
**Symptoms**: 
- Browser console shows CORS error
- Backend shows no request logs

**Check**:
- Backend .env has `CORS_ORIGIN=http://localhost:5173`
- Backend is running and accessible

#### Issue 3: Network Error
**Symptoms**:
- Browser console shows "ERR_CONNECTION_REFUSED" or "Network Error"
- Backend shows no request logs

**Check**:
- Backend is running: `curl http://localhost:3001/health`
- Should respond with: `{"status":"ok","timestamp":"..."}`

#### Issue 4: Authentication Error  
**Symptoms**:
- 401 Unauthorized error
- Redirected to login page

**Solution**:
- Log out and log back in to get a fresh token

#### Issue 5: File Size Too Large
**Symptoms**:
- Alert shows "Image must be less than 2MB"
- Or browser console shows "413 Payload Too Large"

**Solution**:
- Use a smaller image
- Or compress the image before uploading

### Step 4: Manual Test with curl

If the UI continues to fail, test the endpoint directly:

```bash
# 1. Login to get token (replace with your credentials)
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your-email@example.com","password":"your-password"}' \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

echo "Token: $TOKEN"

# 2. Test upload with small image
curl -X POST http://localhost:3001/api/upload/image \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "base64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
    "mimeType": "image/png"
  }'
```

### Next Steps

After trying the upload again with logging enabled, share:
1. The error message from the browser console
2. The backend terminal logs around the time of the upload attempt
3. Any network tab information (Status code, response)

This information will help identify the exact cause of the failure.
