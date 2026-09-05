import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import rateLimit from 'express-rate-limit';
import authRouter from './modules/auth/auth.controller.js';
import userRouter from './modules/user/user.controller.js';
import chatRouter from './modules/chat/chat.controller.js';
import sourcesRouter from './modules/sources/sources.controller.js';
import { pool } from './db/index.js';
import { runMigrations } from './db/migrate.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Security & Middlewares
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));

// Global rate limiter (300 requests per 15 min window)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many requests from this IP. Please try again after 15 minutes.',
    },
  },
});
app.use(globalLimiter);

// Specific Auth Rate Limiter (20 requests per 15 min window)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts. Please try again after 15 minutes.',
    },
  },
});

// Request ID tracking middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const reqId = (req.headers['x-request-id'] as string) || uuidv4();
  req.headers['x-request-id'] = reqId;
  res.setHeader('X-Request-Id', reqId);
  next();
});

// Load balancer & ping endpoints
app.get('/', (_req: Request, res: Response) => {
  return res.status(200).send('Talk to Krishna API is running.');
});

app.get('/health', (_req: Request, res: Response) => {
  return res.status(200).json({ status: 'healthy', service: 'talk-to-krishna-api' });
});

// Health check endpoint
app.get('/api/v1/health', async (_req: Request, res: Response) => {
  try {
    const dbCheck = await pool.query('SELECT 1 as healthy');
    return res.status(200).json({
      status: 'healthy',
      database: dbCheck.rows.length > 0 ? 'connected' : 'unhealthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    });
  } catch (err: any) {
    return res.status(503).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: err.message,
    });
  }
});

// API Routes
app.use('/api/v1/auth', authLimiter, authRouter);
app.use('/api/v1/user', userRouter);
app.use('/api/v1/conversations', chatRouter);
app.use('/api/v1/sources', sourcesRouter);

// Safe global error handler (never leaks stack traces to end users)
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  console.error(`[Unhandled Error] Request ${req.headers['x-request-id']}:`, err);
  return res.status(err.status || 500).json({
    error: {
      code: err.code || 'INTERNAL_SERVER_ERROR',
      message: err.message || 'An unexpected internal error occurred.',
      requestId: req.headers['x-request-id'],
    },
  });
});

const portNum = Number(PORT);

if (process.env.NODE_ENV !== 'test') {
  app.listen(portNum, '0.0.0.0', async () => {
    console.log(`[Talk to Krishna API] Server listening on 0.0.0.0:${portNum}`);
    try {
      await runMigrations();
      console.log('[Talk to Krishna API] Database migrations applied successfully.');
    } catch (migErr: any) {
      console.warn('[Talk to Krishna API] Database migration warning (will retry on next connection):', migErr.message);
    }
  });
}

export default app;
