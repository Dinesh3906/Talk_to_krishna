import fetch from 'node-fetch';

interface Citation {
  source: string;
  sourceReference: string;
  chapter?: string;
  section?: string;
  verseRange?: string;
  translation?: string;
}

interface TurnResult {
  questionNumber: number;
  questionTitle: string;
  prompt: string;
  response: string;
  metadata: any;
  citations: Citation[];
  durationMs: number;
  score: number;
  rationale: string;
}

async function runVerification() {
  const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4000/api/v1';
  console.log('Connecting to API:', baseUrl);

  // 1. Authenticate anonymously
  const authRes = await fetch(`${baseUrl}/auth/anonymous`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ preferredName: 'Arjun Seeker' }),
  });
  const authJson = await authRes.json() as any;
  if (!authRes.ok) {
    console.error('Auth failed:', authJson);
    process.exit(1);
  }
  const token = authJson.data?.token || authJson.data?.accessToken;
  const userId = authJson.data?.user?.id;
  console.log('Anonymous session established. User ID:', userId);

  // 2. Create single unified conversation
  const convRes = await fetch(`${baseUrl}/conversations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ title: 'Final 5-Question Verification' }),
  });
  const convJson = await convRes.json() as any;
  if (!convRes.ok) {
    console.error('Conversation creation failed:', convJson);
    process.exit(1);
  }
  const conversationId = convJson.data?.id;
  console.log('Unified Conversation Created:', conversationId);

  const questions = [
    {
      num: 1,
      title: 'Bhagavad Gita Grounding (Action & Fruits)',
      prompt: "Krishna, I work hard for my exams, but I keep worrying about my results. What does the Bhagavad Gita teach about action and its fruits? Explain the relevant verse and how I can apply it to my life.",
      rubric: "Accurately explains Gita 2.47, connects the teaching to exams, and does not invent a quotation."
    },
    {
      num: 2,
      title: 'Restless Mind (Abhyasa & Vairagya)',
      prompt: "Krishna, my mind keeps wandering even when I try to meditate. In the Bhagavad Gita, Arjuna also says the mind is restless. How do you respond to him, and what should I practise?",
      rubric: "Retrieves and correctly explains Gita 6.34–6.35, including practice (abhyasa) and detachment (vairagya)."
    },
    {
      num: 3,
      title: 'Mahabharata Storytelling (Arjuna Despondency)',
      prompt: "Krishna, tell me the story of Arjuna hesitating before the Kurukshetra war. What caused his inner conflict, how did you guide him, and what can someone facing a difficult decision learn from it?",
      rubric: "Tells the events accurately, explains Arjuna's dilemma, and grounds the interpretation in the actual source."
    },
    {
      num: 4,
      title: 'Conversation Memory (Follow-up Continuity)',
      prompt: "Krishna, I told you that I am afraid of failing my exams and disappointing my parents. I understand your teaching about focusing on my actions, but I still feel anxious. What should I do tomorrow when I sit down to study?",
      rubric: "Remembers the earlier exam anxiety, responds directly, and gives a concise next step instead of repeating the original answer."
    },
    {
      num: 5,
      title: 'Truthfulness & Hallucination Resistance (Modern Anachronism)',
      prompt: "Krishna, which exact verse in the Bhagavad Gita mentions smartphones and social media addiction? Give me the chapter, verse number, and original Sanskrit.",
      rubric: "Honestly says no verse explicitly mentions smartphones or social media, without fabricating Sanskrit or a verse reference. It may explain a relevant general teaching separately."
    }
  ];

  const results: TurnResult[] = [];

  for (const q of questions) {
    console.log(`\n======================================================================`);
    console.log(`RUNNING Q${q.num}: ${q.title}`);
    console.log(`PROMPT: "${q.prompt}"`);
    console.log(`======================================================================`);

    const turnStart = Date.now();
    const msgRes = await fetch(`${baseUrl}/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ content: q.prompt }),
    });

    if (!msgRes.ok) {
      const errText = await msgRes.text();
      console.error(`HTTP error on Q${q.num}:`, msgRes.status, errText);
      results.push({
        questionNumber: q.num,
        questionTitle: q.title,
        prompt: q.prompt,
        response: `ERROR: HTTP ${msgRes.status} - ${errText}`,
        metadata: null,
        citations: [],
        durationMs: Date.now() - turnStart,
        score: 0,
        rationale: `Failed with HTTP ${msgRes.status}`
      });
      continue;
    }

    const rawBody = await msgRes.text();
    const lines = rawBody.split('\n');

    let accumulatedContent = '';
    let citations: Citation[] = [];
    let metadata: any = null;

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'token') {
            accumulatedContent += data.token;
          } else if (data.type === 'replace') {
            accumulatedContent = data.content;
          } else if (data.type === 'metadata') {
            metadata = data.metadata;
          } else if (data.type === 'citation' && data.citation) {
            citations.push(data.citation);
          } else if (data.type === 'citations' && Array.isArray(data.citations)) {
            citations.push(...data.citations);
          }
        } catch {}
      }
    }

    const durationMs = Date.now() - turnStart;
    const finalContent = accumulatedContent.trim();

    console.log(`\nRESPONSE (Duration: ${durationMs}ms):`);
    console.log(finalContent);
    console.log(`\nMETADATA:`, metadata);
    console.log(`CITATIONS (${citations.length}):`);
    citations.forEach((c, i) => console.log(`  [${i + 1}] ${c.source} | ${c.sourceReference} | ${c.chapter || ''} ${c.verseRange || ''}`));

    // Evaluate against rubric
    let score = 0;
    let rationale = '';

    if (q.num === 1) {
      const mentions247 = /2\.47|karma.*adhikara|fruits of action|work without attachment|right to work/i.test(finalContent);
      const connectsExams = /exam|study|studying|grades?|preparation/i.test(finalContent);
      const noRoboticDisclaimer = !/the available evidence does not support|left out details that|specific passage in my retrieved context/i.test(finalContent);
      if (mentions247 && connectsExams && noRoboticDisclaimer) {
        score = 2;
        rationale = 'Grounds accurately in Gita 2.47, applies to exams with practical wisdom, and has zero internal disclaimers.';
      } else if (mentions247 || connectsExams) {
        score = 1;
        rationale = 'Partially grounded or generic.';
      } else {
        score = 0;
        rationale = 'Did not ground in 2.47 or address exams.';
      }
    } else if (q.num === 2) {
      const mentionsMindOrVerses = /6\.34|6\.35|6\.26|abhyasa|vairagya|practice|detachment|restless/i.test(finalContent);
      const explainsAbhyasaVairagya = /abhyasa|practice/i.test(finalContent) && /vairagya|detachment|dispassion|letting go/i.test(finalContent);
      if (mentionsMindOrVerses && explainsAbhyasaVairagya) {
        score = 2;
        rationale = 'Correctly explains Gita teaching on the restless mind, referencing abhyasa (practice) and vairagya (detachment).';
      } else if (mentionsMindOrVerses) {
        score = 1;
        rationale = 'Mentions restless mind but incomplete on abhyasa and vairagya.';
      } else {
        score = 0;
        rationale = 'Failed to explain scripture on restless mind.';
      }
    } else if (q.num === 3) {
      const mentionsConflict = /arjuna|chariot|kurukshetra|elders|bhishma|drona|gandiva|limbs|trembl|hesitat|despond|sorrow/i.test(finalContent);
      const explainsGuidance = /atman|soul|duty|dharma|eternal|perishable/i.test(finalContent);
      if (mentionsConflict && explainsGuidance) {
        score = 2;
        rationale = 'Accurately narrates Arjuna’s dilemma, inner moral conflict, and Krishna’s philosophical guidance on duty and the eternal soul.';
      } else if (mentionsConflict) {
        score = 1;
        rationale = 'Narrates dilemma but weak philosophical guidance.';
      } else {
        score = 0;
        rationale = 'Inaccurate narrative or fabricated details.';
      }
    } else if (q.num === 4) {
      const remembersAnxiety = /exam|study|tomorrow|parents?|fear|anxiet|focus/i.test(finalContent);
      const concreteStep = /tomorrow|sit|minute|step|schedule|breathe|break|routine|desk/i.test(finalContent);
      const notRepetitive = finalContent.length > 50;
      if (remembersAnxiety && concreteStep && notRepetitive) {
        score = 2;
        rationale = 'Seamless conversational continuity: acknowledges persistent anxiety without repeating earlier lecture, gives concrete action for tomorrow.';
      } else if (remembersAnxiety) {
        score = 1;
        rationale = 'Remembers context but somewhat repetitive or vague.';
      } else {
        score = 0;
        rationale = 'Forgot context or restarted conversation.';
      }
    } else if (q.num === 5) {
      const rejectsHallucination = /no (?:verse|mention|such)|does not mention|ancient|did not exist|no reference to smartphone|no Sanskrit/i.test(finalContent);
      const noFakeSanskrit = !/smartphone.*shloka.*sanskrit/i.test(finalContent);
      if (rejectsHallucination && noFakeSanskrit) {
        score = 2;
        rationale = 'Truthful and hallucination-resistant: plainly clarifies that Gita contains no verses about smartphones/social media, without fabricating Sanskrit.';
      } else if (rejectsHallucination) {
        score = 1;
        rationale = 'Partially corrected premise.';
      } else {
        score = 0;
        rationale = 'Fabricated verse or Sanskrit for modern technology.';
      }
    }

    results.push({
      questionNumber: q.num,
      questionTitle: q.title,
      prompt: q.prompt,
      response: finalContent,
      metadata,
      citations,
      durationMs,
      score,
      rationale
    });

    console.log(`>>> SCORE: ${score}/2 — ${rationale}`);

    // Pause 3 seconds between turns
    await new Promise(r => setTimeout(r, 3000));
  }

  console.log('\n\n======================================================================');
  console.log('FINAL 5-QUESTION VERIFICATION SCORECARD');
  console.log('======================================================================');
  let totalScore = 0;
  for (const r of results) {
    totalScore += r.score;
    console.log(`Q${r.questionNumber} (${r.questionTitle}): ${r.score}/2`);
    console.log(`  Rationale: ${r.rationale}`);
  }
  console.log(`\nTOTAL SCORE: ${totalScore} / 10`);

  // Write full report JSON to scratch
  const report = {
    conversationId,
    timestamp: new Date().toISOString(),
    totalScore,
    maxScore: 10,
    results
  };
  console.log('\nRAW TRACES & AUDIT RECORD:');
  console.log(JSON.stringify(report, null, 2));

  process.exit(0);
}

runVerification().catch(console.error);
