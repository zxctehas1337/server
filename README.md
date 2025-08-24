# Browser Messenger

A minimal but scalable browser-based messenger application built with Node.js, Express, Socket.IO, and PostgreSQL.

## Features

- **Real-time messaging** using Socket.IO
- **User authentication** with username/password
- **Persistent message storage** in PostgreSQL
- **Responsive web interface** with modern CSS
- **Connection status indicators** and error handling
- **User join/leave notifications**
- **Clean, modern UI** with message bubbles

## Tech Stack

- **Backend**: Node.js, Express.js
- **Real-time Communication**: Socket.IO
- **Database**: PostgreSQL
- **Frontend**: Vanilla HTML, CSS, JavaScript
- **Development**: nodemon for hot reloading

## Project Structure

```
browser-messenger/
├── src/
│   └── server.js          # Main server file
├── public/
│   ├── index.html         # Main HTML page
│   ├── style.css          # CSS styles
│   └── app.js             # Client-side JavaScript
├── sql/
│   └── schema.sql         # Database schema
├── package.json           # Dependencies and scripts
├── .env.example          # Environment variables template
├── README.md             # This file
└── SECURITY_AND_ENHANCEMENTS.md  # Security guide
```

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd browser-messenger
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up PostgreSQL database**
   ```bash
   # Create database
   createdb browser_messenger
   
   # Run schema
   psql -d browser_messenger -f sql/schema.sql
   ```

4. **Configure environment variables**
   ```bash
   # Copy example environment file
   cp .env.example .env
   
   # Edit .env with your database credentials
   nano .env
   ```

   Example `.env`:
   ```env
   DATABASE_URL=postgresql://username:password@localhost:5432/browser_messenger
   PORT=3000
   NODE_ENV=development
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

6. **Access the application**
   Open your browser and navigate to `http://localhost:3000`

## Usage

### Starting a Chat

1. Open the application in your browser
2. Enter a username (minimum 3 characters)
3. Enter a password (minimum 4 characters)
4. Click "Join Chat"

### Sending Messages

1. After joining, type your message in the input field
2. Press Enter or click "Send" to send the message
3. Messages appear in real-time for all connected users

### Features in Action

- **Real-time updates**: Messages appear instantly for all users
- **User notifications**: See when users join or leave the chat
- **Connection status**: Get notified about connection issues
- **Responsive design**: Works on desktop and mobile devices

## API Endpoints

### HTTP Endpoints

- `GET /` - Serve the main chat interface
- `GET /health` - Health check endpoint (if implemented)

### Socket.IO Events

#### Client to Server

- `set_username` - Set user credentials
  ```javascript
  socket.emit('set_username', { username: 'john', password: 'secret' });
  ```

- `send_message` - Send a chat message
  ```javascript
  socket.emit('send_message', { content: 'Hello world!' });
  ```

#### Server to Client

- `username_set` - Confirmation of username setting
- `new_message` - New message broadcast
- `user_joined` - User join notification
- `user_left` - User leave notification
- `error` - Error message

## Database Schema

### Users Table
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### Messages Table
```sql
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

## Development

### Available Scripts

- `npm start` - Start the production server
- `npm run dev` - Start development server with hot reload
- `npm test` - Run tests (not implemented yet)

### Development Workflow

1. Make changes to the code
2. The server will automatically restart (thanks to nodemon)
3. Refresh your browser to see changes

### Adding New Features

1. For database changes, update `sql/schema.sql`
2. For server-side logic, modify `src/server.js`
3. For client-side features, update files in the `public/` directory

## Security Considerations

⚠️ **This is a MVP/prototype**. For production use, please review `SECURITY_AND_ENHANCEMENTS.md` for important security considerations including:

- Password hashing (currently not implemented)
- XSS prevention
- Rate limiting
- HTTPS enforcement
- Session management

## Deployment

### Environment Setup

For production deployment:

1. Set `NODE_ENV=production`
2. Use a production PostgreSQL instance
3. Configure proper SSL/HTTPS
4. Set up monitoring and logging
5. Implement proper secret management

### Docker (Optional)

```dockerfile
# Example Dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## Future Enhancements

The application can be extended with:

- **Private messaging** between users
- **Multiple chat rooms/channels**
- **File upload and sharing**
- **Message history pagination**
- **Read receipts and typing indicators**
- **User presence (online/offline status)**
- **Push notifications**
- **Message reactions and emoji support**
- **Admin moderation panel**

See `SECURITY_AND_ENHANCEMENTS.md` for detailed implementation guides.

## Troubleshooting

### Common Issues

1. **Database connection failed**
   - Check PostgreSQL is running
   - Verify database credentials in `.env`
   - Ensure database exists and schema is loaded

2. **Port already in use**
   - Change PORT in `.env` file
   - Kill existing process on port 3000

3. **Messages not sending**
   - Check browser console for JavaScript errors
   - Verify WebSocket connection is established
   - Check server logs for error messages

### Logs and Debugging

- Server logs appear in the terminal where you ran `npm run dev`
- Client-side errors appear in browser developer console (F12)
- Check network tab in browser dev tools for WebSocket connection status

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make changes and test thoroughly
4. Commit changes: `git commit -am 'Add feature'`
5. Push to branch: `git push origin feature-name`
6. Create a Pull Request

## License

This project is licensed under the ISC License - see the `package.json` file for details.

## Support

For questions or issues:
1. Check this README and the security guide
2. Look at existing GitHub issues
3. Create a new issue with detailed information

---

**Note**: This is a learning project and MVP. For production use, implement proper security measures as outlined in `SECURITY_AND_ENHANCEMENTS.md`.
