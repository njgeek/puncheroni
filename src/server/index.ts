import { Server } from 'colyseus';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { GameRoom } from './rooms/GameRoom';

const PORT = parseInt(process.env.PORT || '3000', 10);

// Determine client path
const distClientPath = path.resolve(process.cwd(), 'dist', 'client');
const clientPath = fs.existsSync(distClientPath) ? distClientPath : path.resolve(__dirname, '..', '..', 'dist', 'client');

const gameServer = new Server({
  express: (app) => {
    // CORS for dev mode (Vite on port 3001)
    app.use(cors());

    // Health check
    app.get('/health', (_req, res) => {
      res.json({ status: 'ok' });
    });

    // Serve static client files
    if (fs.existsSync(clientPath)) {
      console.log('Serving client from:', clientPath);
      app.use(express.static(clientPath));

      // Fallback to index.html
      app.use((_req, res, next) => {
        const indexPath = path.join(clientPath, 'index.html');
        if (fs.existsSync(indexPath)) {
          res.sendFile(indexPath);
        } else {
          next();
        }
      });
    }
  },
});

gameServer.define('game', GameRoom);

gameServer.listen(PORT).then(() => {
  console.log(`Puncheroni server running on http://localhost:${PORT}`);
});
