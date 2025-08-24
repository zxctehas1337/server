# Render.com Deployment Guide

## Prerequisites
- GitHub repository with your code
- Render.com account (free)

## Option 1: Automated Deployment with render.yaml

1. **Push your code to GitHub** (including the new `render.yaml` file)

2. **Create Blueprint on Render:**
   - Go to Render Dashboard
   - Click "New" → "Blueprint"
   - Connect your GitHub repository
   - Render will automatically detect `render.yaml` and create both services

3. **Services Created:**
   - PostgreSQL Database: `browser-messenger-db`
   - Web Service: `browser-messenger`

## Option 2: Manual Deployment

### Step 1: Create PostgreSQL Database
1. Go to Render Dashboard
2. Click "New" → "PostgreSQL"
3. Configure:
   - Name: `browser-messenger-db`
   - Database Name: `browser_messenger`
   - User: `browser_messenger_user`
   - Plan: Free (for testing) or Starter (for production)
4. Click "Create Database"
5. **Save the connection details** provided

### Step 2: Create Web Service
1. Go to Render Dashboard
2. Click "New" → "Web Service"
3. Connect your GitHub repository
4. Configure:
   - Name: `browser-messenger`
   - Runtime: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Plan: Free (for testing) or Starter (for production)

### Step 3: Environment Variables
In your Web Service settings, add these environment variables:
- `NODE_ENV`: `production`
- `DATABASE_URL`: (Copy from your PostgreSQL service's connection string)
- `PORT`: `10000` (Render's default)

## Post-Deployment

### Database Initialization
The database schema will be automatically created via the `postinstall` script in `package.json`.

### Verify Deployment
1. Check your Web Service URL (provided by Render)
2. Visit the URL - you should see your messenger interface
3. Check logs in Render dashboard for any issues

## Important Notes

- **Free Plan Limitations:**
  - Web service spins down after 15 minutes of inactivity
  - Database has limited storage and connections
  - No custom domains

- **Production Recommendations:**
  - Upgrade to Starter plans for better performance
  - Add environment variables for security (SECRET_KEY, etc.)
  - Consider adding monitoring and logging

## Troubleshooting

### Common Issues:
1. **Database connection failed**: Check DATABASE_URL environment variable
2. **Build failed**: Ensure all dependencies are in `package.json`
3. **Service won't start**: Check logs in Render dashboard

### Useful Commands for Local Testing:
```bash
# Test database initialization
npm run init-db

# Start in production mode
NODE_ENV=production npm start
```

## URLs After Deployment
- Web Service: `https://browser-messenger.onrender.com` (or similar)
- Database: Internal connection via DATABASE_URL

Your messenger app will be live and accessible worldwide!
