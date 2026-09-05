import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.resolve(__dirname, '../dist');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Fallback Express serverless entrypoint in case Vercel project preset is set to Express.js
const serverJsContent = `const express = require('express');
const path = require('path');
const app = express();

app.use(express.static(__dirname));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

module.exports = app;
`;

fs.writeFileSync(path.join(distDir, 'app.js'), serverJsContent, 'utf8');
fs.writeFileSync(path.join(distDir, 'server.js'), serverJsContent, 'utf8');
fs.writeFileSync(path.join(distDir, 'index.js'), serverJsContent, 'utf8');

console.log('✅ Generated serverless fallback entrypoints in apps/mobile/dist');
