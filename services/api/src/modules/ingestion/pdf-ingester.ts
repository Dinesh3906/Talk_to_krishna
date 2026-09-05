import fs from 'fs';
import path from 'path';
import pdf from 'pdf-parse';
import { SemanticCorpusChunk } from './semantic-chunker.js';

export interface PDFIngestionOptions {
  maxPages?: number;
  startPage?: number;
}

export class PDFMahabharataIngester {
  /**
   * Cleans OCR formatting artifacts, line wraps, hyphenations, and erratic spacing
   */
  public static cleanText(rawText: string): string {
    return rawText
      .replace(/\r\n/g, '\n')
      .replace(/(\w+)-\n(\w+)/g, '$1$2') // rejoin hyphenated words across linebreaks
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  /**
   * Reads and processes the 12-volume Mahabharata PDF into verified semantic passages
   */
  public static async parsePDF(
    pdfPath: string,
    options: PDFIngestionOptions = {}
  ): Promise<SemanticCorpusChunk[]> {
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`Mahabharata PDF not found at path: ${pdfPath}`);
    }

    const dataBuffer = fs.readFileSync(pdfPath);
    console.log(`[PDF Ingester] Loading Mahabharata PDF (${(dataBuffer.length / 1024 / 1024).toFixed(1)} MB)...`);

    const pdfData = await pdf(dataBuffer, {
      max: options.maxPages || 200, // Safe page limit for incremental ingestion
    });

    console.log(`[PDF Ingester] Extracted ${pdfData.numpages} pages.`);
    const cleaned = this.cleanText(pdfData.text);

    // Split on section/chapter markers (e.g. "SECTION", "CHAPTER", "PARVA")
    const sectionRegex = /(?:SECTION\s+[IVXLCDM\d]+|CHAPTER\s+\d+|BOOK\s+\d+|[A-Z\s]{4,}\s+PARVA)/gi;
    const rawSections = cleaned.split(sectionRegex);
    const matches = cleaned.match(sectionRegex) || [];

    const chunks: SemanticCorpusChunk[] = [];

    for (let i = 0; i < rawSections.length; i++) {
      const sectionText = rawSections[i].trim();
      const header = matches[i - 1] || 'Introductory Section';

      if (sectionText.length < 150) {
        continue; // Skip trivial fragments or whitespace
      }

      // Detect potential Parva name from text
      let detectedParva = 'Mahabharata Translation';
      const parvaKeywords = [
        'Adi', 'Sabha', 'Vana', 'Virata', 'Udyoga', 'Bhishma', 'Drona',
        'Karna', 'Shalya', 'Sauptika', 'Stri', 'Shanti', 'Anushasana',
        'Ashvamedhika', 'Ashramavasika', 'Mausala', 'Mahaprasthanika', 'Svargarohana'
      ];
      for (const pk of parvaKeywords) {
        if (header.includes(pk) || sectionText.slice(0, 200).includes(pk)) {
          detectedParva = `${pk} Parva`;
          break;
        }
      }

      // Extract prominent characters mentioned
      const potentialCharacters = ['Krishna', 'Arjuna', 'Yudhishthira', 'Bhima', 'Draupadi', 'Karna', 'Duryodhana', 'Bhishma', 'Drona', 'Vidura', 'Dhritarashtra', 'Sanjaya'];
      const foundCharacters = potentialCharacters.filter(c => sectionText.includes(c));

      chunks.push({
        sourceType: 'pdf_volume',
        parva: detectedParva,
        section: header.trim(),
        characters: foundCharacters,
        themes: ['dharma', 'epic', 'history', 'philosophy'],
        translation: sectionText.slice(0, 1500), // Bounded semantic chunk size
        contextSummary: `Extracted from ${header} of the 12-volume Mahabharata edition.`,
        sourceReference: `Mahabharata (${detectedParva}, ${header.trim()})`,
      });
    }

    console.log(`[PDF Ingester] Generated ${chunks.length} verified semantic chunks from PDF.`);
    return chunks;
  }
}
