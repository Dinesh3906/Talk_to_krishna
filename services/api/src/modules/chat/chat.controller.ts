import { Router, Request, Response } from 'express';
import { eq, and, desc, asc } from 'drizzle-orm';
import { authMiddleware } from '../auth/auth.middleware.js';
import { db } from '../../db/index.js';
import { conversations, messages, messageCitations } from '../../db/schema.js';
import { AIOrchestratorService } from '../ai/ai-orchestrator.service.js';
import { SendMessageSchema, CreateConversationSchema, StreamChunk } from '@talk-to-krisna/shared';

const router = Router();

router.use(authMiddleware);

// 1. List User Conversations
router.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  try {
    const list = await db.query.conversations.findMany({
      where: and(eq(conversations.userId, userId), eq(conversations.isDeleted, false)),
      orderBy: [desc(conversations.updatedAt)],
      limit: 50,
    });

    return res.status(200).json({ data: list });
  } catch (err: any) {
    return res.status(500).json({
      error: { code: 'CONVERSATIONS_FETCH_FAILED', message: err.message },
    });
  }
});

// 2. Create New Conversation
router.post('/', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const parseResult = CreateConversationSchema.safeParse(req.body);
  const title = parseResult.success && parseResult.data.title ? parseResult.data.title : 'New Reflection';

  try {
    const [created] = await db
      .insert(conversations)
      .values({
        userId,
        title,
      })
      .returning();

    return res.status(201).json({ data: created });
  } catch (err: any) {
    return res.status(500).json({
      error: { code: 'CONVERSATION_CREATION_FAILED', message: err.message },
    });
  }
});

// 3. Get Conversation Details with Messages & Citations
router.get('/:id', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const conversationId = req.params.id as string;

  try {
    const conv = await db.query.conversations.findFirst({
      where: and(
        eq(conversations.id, conversationId),
        eq(conversations.userId, userId),
        eq(conversations.isDeleted, false)
      ),
    });

    if (!conv) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Conversation not found.' },
      });
    }

    const messageRows = await db.query.messages.findMany({
      where: eq(messages.conversationId, conversationId),
      orderBy: [asc(messages.createdAt)],
    });

    // Fetch citations for all assistant messages
    const messageIds = messageRows.map((m) => m.id);
    const citationRows = messageIds.length > 0
      ? await db.query.messageCitations.findMany({
          where: (c, { inArray }) => inArray(c.messageId, messageIds),
        })
      : [];

    const citationsByMessageId = new Map<string, any[]>();
    for (const c of citationRows) {
      const list = citationsByMessageId.get(c.messageId) || [];
      list.push({
        id: c.id,
        source: c.source,
        parva: c.parva,
        chapter: c.chapter,
        section: c.section,
        verseRange: c.verseRange,
        speaker: c.speaker,
        listener: c.listener,
        translation: c.translation,
        originalText: c.originalText,
        sourceReference: c.sourceReference,
        relevanceScore: c.relevanceScore,
        quoteType: c.quoteType,
      });
      citationsByMessageId.set(c.messageId, list);
    }

    const fullMessages = messageRows.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      sender: m.sender,
      content: m.content,
      intentCategory: m.intentCategory,
      emotionalState: m.emotionalState,
      reflectionQuestion: m.reflectionQuestion,
      citations: citationsByMessageId.get(m.id) || [],
      createdAt: m.createdAt.toISOString(),
    }));

    return res.status(200).json({
      data: {
        ...conv,
        messages: fullMessages,
      },
    });
  } catch (err: any) {
    return res.status(500).json({
      error: { code: 'CONVERSATION_DETAIL_FAILED', message: err.message },
    });
  }
});

// 4. Delete Conversation
router.delete('/:id', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const conversationId = req.params.id as string;

  try {
    await db
      .update(conversations)
      .set({ isDeleted: true, updatedAt: new Date() })
      .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)));

    return res.status(200).json({ success: true, message: 'Conversation deleted.' });
  } catch (err: any) {
    return res.status(500).json({
      error: { code: 'CONVERSATION_DELETION_FAILED', message: err.message },
    });
  }
});

// 5. Delete Individual Message (Enforces strict user ownership)
router.delete('/:id/messages/:messageId', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const conversationId = req.params.id as string;
  const messageId = req.params.messageId as string;

  try {
    const conv = await db.query.conversations.findFirst({
      where: and(
        eq(conversations.id, conversationId),
        eq(conversations.userId, userId),
        eq(conversations.isDeleted, false)
      ),
    });

    if (!conv) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Conversation not found or unauthorized.' },
      });
    }

    await db
      .delete(messages)
      .where(and(eq(messages.id, messageId), eq(messages.conversationId, conversationId)));

    return res.status(200).json({ success: true, message: 'Message deleted.' });
  } catch (err: any) {
    return res.status(500).json({
      error: { code: 'MESSAGE_DELETION_FAILED', message: err.message },
    });
  }
});

// 6. Post Message with Real-Time SSE Streaming
router.post('/:id/messages', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const conversationId = req.params.id as string;

  const parseResult = SendMessageSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: parseResult.error.errors[0]?.message || 'Invalid message content',
      },
    });
  }

  const { content, preferredName } = parseResult.data;

  // Verify conversation ownership
  const conv = await db.query.conversations.findFirst({
    where: and(
      eq(conversations.id, conversationId),
      eq(conversations.userId, userId),
      eq(conversations.isDeleted, false)
    ),
  });

  if (!conv) {
    return res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Conversation not found.' },
    });
  }

  // 1. Save user message in PostgreSQL
  await db.insert(messages).values({
    conversationId,
    sender: 'user',
    content,
  });

  // 2. Configure SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sendEvent = (chunk: StreamChunk) => {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  };

  try {
    await AIOrchestratorService.execute({
      userId,
      conversationId,
      userMessage: content,
      preferredName: preferredName || req.user?.preferredName,
      onStreamChunk: sendEvent,
    });
    res.end();
  } catch (err: any) {
    // Fail cleanly with 503 / error event if AI provider unavailable
    sendEvent({
      type: 'error',
      error: err.message || 'The AI service is currently unavailable. Please try again.',
      errorCode: 'SERVICE_UNAVAILABLE',
    });
    res.end();
  }
});

export default router;
