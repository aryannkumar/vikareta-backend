import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '../utils/logger';

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ 
    server,
    path: '/api/ws'
  });

  wss.on('connection', (ws: WebSocket, req) => {
    const clientIp = req.socket.remoteAddress;
    logger.info('WebSocket client connected', { clientIp });

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'welcome',
      message: 'Connected to Vikareta WebSocket server',
      timestamp: new Date().toISOString()
    }));

    // Handle incoming messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        logger.info('WebSocket message received', { message });

        // Echo the message back for now
        ws.send(JSON.stringify({
          type: 'echo',
          data: message,
          timestamp: new Date().toISOString()
        }));
      } catch (error) {
        logger.error('WebSocket message parse error', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format',
          timestamp: new Date().toISOString()
        }));
      }
    });

    // Handle connection close
    ws.on('close', (code, reason) => {
      logger.info('WebSocket client disconnected', { 
        clientIp, 
        code, 
        reason: reason.toString() 
      });
    });

    // Handle errors
    ws.on('error', (error) => {
      logger.error('WebSocket error', { clientIp, error });
    });

    // Send periodic ping to keep connection alive
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      } else {
        clearInterval(pingInterval);
      }
    }, 30000); // 30 seconds

    // Handle pong responses
    ws.on('pong', () => {
      logger.debug('WebSocket pong received', { clientIp });
    });
  });

  logger.info('WebSocket server initialized on /api/ws');
  return wss;
}