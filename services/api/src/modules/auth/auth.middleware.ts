import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service.js';
import { User } from '@talk-to-krisna/shared';

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or malformed Authorization header.',
      },
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const user = await AuthService.verifyToken(token);
    req.user = user;
    next();
  } catch (err: any) {
    return res.status(401).json({
      error: {
        code: 'INVALID_TOKEN',
        message: err.message,
      },
    });
  }
}
