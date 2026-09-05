import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { CorpusCompletenessAuditor } from './corpus-completeness-auditor.js';
import { pool } from '../../db/index.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const pdfPath = path.resolve(__dirname, '../../../../../The Complete Mahabharata Volume 1-12.pdf');
  console.log('[Audit CLI] Running deterministic completeness auditor against:', pdfPath);

  try {
    const report = await CorpusCompletenessAuditor.runAudit(pdfPath);
    if (report.acceptance.overallStatus === 'PRODUCTION CORPUS: VERIFIED') {
      console.log('SUCCESS: PRODUCTION CORPUS IS 100% DETERMINISTICALLY VERIFIED!');
      process.exit(0);
    } else {
      console.log('NOTICE: Ingestion gaps detected. Ingestion is required to reach 100% verification.');
      process.exit(0);
    }
  } catch (err: any) {
    console.error('[Audit CLI Error]:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
