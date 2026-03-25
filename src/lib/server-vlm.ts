// 服务器端VLM调用函数（只能在API路由中使用）

interface ImageData {
  base64: string;
  mimeType: string;
}

function getImageData(imagePath: string): ImageData {
  if (imagePath.startsWith('data:')) {
    const mimeMatch = imagePath.match(/^data:([^;]+);base64,/);
    const mimeType = mimeMatch?.[1] || 'image/jpeg';
    const base64 = imagePath.split(',')[1];
    return { base64, mimeType };
  }
  return { base64: imagePath, mimeType: 'image/jpeg' };
}

interface VLMResult {
  screenUnderstanding: string;
  chips: string[];
}

function parseVLMResponse(raw: string): VLMResult {
  console.log('[parseVLMResponse] Raw length:', raw.length);
  console.log('[parseVLMResponse] Raw content:', raw.substring(0, 800));

  let content = raw.trim();

  // Step 1: strip markdown code fences
  content = content.replace(/^```(?:json)?\s*\n?/gm, '').replace(/\n?```\s*$/gm, '').trim();

  // Step 2: try full-text JSON.parse
  const jsonAttempt = tryParseJSON(content);
  if (jsonAttempt) {
    const result = extractFromParsed(jsonAttempt);
    if (result) return result;
  }

  // Step 3: find the outermost { ... } substring
  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const substr = content.substring(firstBrace, lastBrace + 1);
    const parsed = tryParseJSON(substr);
    if (parsed) {
      const result = extractFromParsed(parsed);
      if (result) return result;
    }
  }

  // Step 4: try to find a JSON array of strings
  const arrMatch = content.match(/\[[\s\S]*?\]/);
  if (arrMatch) {
    const parsed = tryParseJSON(arrMatch[0]);
    if (Array.isArray(parsed)) {
      const chips = parsed
        .map((c: unknown) => (typeof c === 'string' ? c : (c as { text?: string })?.text))
        .filter((s): s is string => typeof s === 'string' && s.length > 2)
        .slice(0, 2);
      if (chips.length > 0) {
        return { screenUnderstanding: '已分析屏幕内容', chips };
      }
    }
  }

  // Step 5: extract Chinese question sentences from free-form text
  const chips = extractQuestionsFromText(content);
  console.log('[parseVLMResponse] Fallback text extraction got:', chips);
  return { screenUnderstanding: '已分析屏幕内容', chips };
}

function tryParseJSON(str: string): unknown | null {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function extractFromParsed(parsed: unknown): VLMResult | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;

  const screenUnderstanding =
    (typeof obj.screen_briefing === 'string' ? obj.screen_briefing : null) ||
    (typeof obj.screenUnderstanding === 'string' ? obj.screenUnderstanding : null) ||
    '已分析屏幕内容';

  if (!Array.isArray(obj.chips)) return null;

  const chips = (obj.chips as unknown[])
    .map((c: unknown) => {
      if (typeof c === 'string') return c;
      if (c && typeof c === 'object' && 'text' in c && typeof (c as { text: unknown }).text === 'string') {
        return (c as { text: string }).text;
      }
      return null;
    })
    .filter((s): s is string => typeof s === 'string' && s.length > 1)
    .slice(0, 2);

  if (chips.length === 0) return null;

  console.log('[extractFromParsed] Success:', { screenUnderstanding, chips });
  return { screenUnderstanding, chips };
}

function extractQuestionsFromText(text: string): string[] {
  const questions: string[] = [];

  // Chinese question marks
  const qSentences = text.match(/[^。！？.!\n]*[？?][^。！？.!\n]*/g);
  if (qSentences) {
    for (const s of qSentences) {
      const q = s.replace(/^[\s\d.、\-•]+/, '').trim();
      if (q.length >= 4 && q.length <= 30) {
        questions.push(q);
      }
    }
  }

  // Numbered list items (1. xxx  2. xxx)
  if (questions.length < 2) {
    const numbered = text.match(/\d+[.、]\s*(.{4,25})/g);
    if (numbered) {
      for (const n of numbered) {
        const q = n.replace(/^\d+[.、]\s*/, '').trim();
        if (q.length >= 4 && !questions.includes(q)) {
          questions.push(q.endsWith('？') || q.endsWith('?') ? q : q + '？');
        }
      }
    }
  }

  return [...new Set(questions)].slice(0, 2);
}

// ── MiniMax Vision API ──
export async function callMiniMaxVisionAPI(
  imagePath: string,
  prompt: string,
  apiKey: string
): Promise<VLMResult> {
  console.log('[MiniMax API] Starting call');

  const { base64, mimeType } = getImageData(imagePath);
  console.log('[MiniMax API] Image mimeType:', mimeType, 'base64 length:', base64.length);

  const response = await fetch('https://api.minimaxi.com/anthropic/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      temperature: 0.3,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
          { type: 'text', text: prompt }
        ]
      }]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('[MiniMax API] HTTP', response.status, errText);
    throw new Error(`MiniMax API ${response.status}: ${errText.substring(0, 300)}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text || '';
  console.log('[MiniMax API] Raw response:', content.substring(0, 500));

  return parseVLMResponse(content);
}

// ── GLM-4V API ──
export async function callGLMVisionAPI(
  imagePath: string,
  prompt: string,
  apiKey: string
): Promise<VLMResult> {
  const startTime = Date.now();
  console.log('[GLM API] Starting call');

  const { base64, mimeType } = getImageData(imagePath);
  console.log('[GLM API] Image mimeType:', mimeType, 'base64 length:', base64.length);

  const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'glm-4v-flash',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } }
        ]
      }],
      max_tokens: 1024,
      temperature: 0.3
    })
  });

  const elapsed = Date.now() - startTime;
  console.log('[GLM API] Response in', elapsed, 'ms, status:', response.status);

  if (!response.ok) {
    const errText = await response.text();
    console.error('[GLM API] HTTP', response.status, errText);
    throw new Error(`GLM API ${response.status}: ${errText.substring(0, 300)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  console.log('[GLM API] Raw response:', content.substring(0, 500));

  if (!content) {
    throw new Error('GLM API 返回空内容');
  }

  return parseVLMResponse(content);
}
