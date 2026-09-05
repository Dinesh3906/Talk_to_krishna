import { pool } from '../../db/index.js';

async function main() {
  try {
    const res = await pool.query('SELECT count(*) FROM mahabharata_chunks');
    console.log('Mahabharata Chunks Count:', res.rows[0].count);
    const sources = await pool.query('SELECT * FROM mahabharata_sources');
    console.log('Mahabharata Sources:', sources.rows);
  } catch (err) {
    console.error('Error querying db:', err);
  } finally {
    await pool.end();
  }
}

main();
