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
import { assertAuthSecretsConfigured } from './modules/auth/auth-config.js';
import { startApiAfterSchemaCheck } from './server-startup.js';
import { isCorsOriginAllowed, parseAllowedOrigins, safeErrorLogMetadata, safeErrorResponse, sanitizeRequestId } from './http-security.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const allowedOrigins = parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS);

// Security & Middlewares
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (isCorsOriginAllowed(origin, allowedOrigins, process.env.NODE_ENV)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
  credentials: true,
}));
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
  const reqId = sanitizeRequestId(req.headers['x-request-id'], uuidv4());
  req.headers['x-request-id'] = reqId;
  res.setHeader('X-Request-Id', reqId);
  next();
});

// Load balancer & ping endpoints
app.get('/', (_req: Request, res: Response) => {
  return res.status(200).send('Talk to Krishna API is running.');
});

app.get(['/privacy', '/privacy-policy'], (_req: Request, res: Response) => {
  return res.redirect('https://app.termly.io/document/privacy-policy/9568c20d-5e1e-4f75-96c2-caebe0185feb');
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
      emailProvider: process.env.EMAIL_PROVIDER || 'not_explicitly_set',
      hasSmtpConfig: Boolean(process.env.SMTP_USER || process.env.GMAIL_USER),
      hasResendConfig: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== 're_123'),
      timestamp: new Date().toISOString(),
      version: '1.1.2-canonical-gita-grounding',
    });
  } catch (err: any) {
    return res.status(503).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: 'Database connection is unavailable.',
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
  const requestId = req.headers['x-request-id'];
  console.error('[Unhandled Error]', safeErrorLogMetadata(err, requestId));
  const safeError = safeErrorResponse(err, requestId);
  const status = Number.isInteger(err?.status) && err.status >= 400 && err.status <= 599 ? err.status : 500;
  return res.status(status).json({ error: safeError });
});

const portNum = Number(PORT);

if (process.env.NODE_ENV !== 'test') {
  void (async () => {
    assertAuthSecretsConfigured();
    await startApiAfterSchemaCheck(pool, () => app.listen(portNum, '0.0.0.0', () => {
      console.log(`[Talk to Krishna API] Server listening on 0.0.0.0:${portNum}`);
    }));
  })().catch(async (startupError: any) => {
    console.error('[Talk to Krishna API] Startup validation failed:', startupError?.message || startupError);
    if (startupError?.stack) {
      console.error(startupError.stack);
    }
    await pool.end().catch(() => undefined);
    process.exitCode = 1;
  });
}

export default app;
