import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const corpusDir = path.resolve(__dirname, '../../../../../data/mahabharata/corpus');

// GET all 18 Parvas overview
router.get('/parvas', (_req: Request, res: Response) => {
  try {
    const parvas = JSON.parse(fs.readFileSync(path.join(corpusDir, 'parvas_overview.json'), 'utf-8'));
    return res.status(200).json({ data: parvas });
  } catch (err: any) {
    return res.status(500).json({
      error: { code: 'SOURCES_ERROR', message: 'Failed to read Parvas overview' },
    });
  }
});

// GET all 18 Gita Chapters & Key Verses
router.get('/gita', (_req: Request, res: Response) => {
  try {
    const gita = JSON.parse(fs.readFileSync(path.join(corpusDir, 'bhagavad_gita.json'), 'utf-8'));
    return res.status(200).json({ data: gita });
  } catch (err: any) {
    return res.status(500).json({
      error: { code: 'SOURCES_ERROR', message: 'Failed to read Bhagavad Gita sources' },
    });
  }
});

// GET Epic Episodes
router.get('/episodes', (_req: Request, res: Response) => {
  try {
    const episodes = JSON.parse(fs.readFileSync(path.join(corpusDir, 'mahabharata_episodes.json'), 'utf-8'));
    return res.status(200).json({ data: episodes });
  } catch (err: any) {
    return res.status(500).json({
      error: { code: 'SOURCES_ERROR', message: 'Failed to read Mahabharata episodes' },
    });
  }
});

export default router;
