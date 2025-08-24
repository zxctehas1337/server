# Vercel Deployment Guide

## Overview

This project has been migrated to support Vercel deployment with serverless API routes for authentication and health checks.

## API Endpoints

- `GET /api/health` - Health check endpoint
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login

## Real-time Chat Limitation

⚠️ **Important**: Vercel's serverless functions do not support persistent WebSocket connections required for real-time chat features.

### Current Status

- ✅ REST API endpoints (login, register, health) work on Vercel
- ❌ Socket.IO real-time chat features do NOT work on Vercel

### Solutions for Real-time Chat

Choose one of these options:

#### Option 1: Hybrid Approach (Recommended)
- Deploy REST API to Vercel (authentication, user management)
- Deploy Socket.IO server to a different provider (Heroku, Railway, DigitalOcean)
- Update frontend to use Vercel for auth and separate server for chat

#### Option 2: Replace with Real-time Service
- Replace Socket.IO with a managed service:
  - **Supabase Realtime**: Free tier available
  - **Ably**: Good free tier
  - **Pusher**: Popular choice
  - **Liveblocks**: Great for collaborative features

#### Option 3: Polling-based Chat
- Replace real-time updates with periodic API calls
- Less real-time but works entirely on Vercel

## Environment Variables

Set these in your Vercel dashboard:

- `DATABASE_URL` - PostgreSQL connection string
- `DB_HOST` - Database host (if not using DATABASE_URL)
- `DB_PORT` - Database port
- `DB_NAME` - Database name
- `DB_USER` - Database username
- `DB_PASSWORD` - Database password
- `NODE_ENV` - Set to "production"

## Local Development

1. Install Vercel CLI: `npm i -g vercel`
2. Set up environment variables in `.env`
3. Run: `npm run vercel-dev`
4. Test endpoints:
   - http://localhost:3000/api/health
   - POST http://localhost:3000/api/auth/register
   - POST http://localhost:3000/api/auth/login

## Deployment Steps

1. Push your code to GitHub
2. Import the project in Vercel dashboard
3. Set environment variables
4. Deploy!

Your API will be available at `https://your-project.vercel.app/api/*`
