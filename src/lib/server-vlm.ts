// 服务器端VLM调用函数（只能在API路由中使用）

// 调用MiniMax Vision API（兼容Anthropic格式）
export async function callMiniMaxVisionAPI(
  imagePath: string,
  prompt: string,
  apiKey: string
): Promise<{ screenUnderstanding: string; chips: string[] }> {
  const fs = await import('fs/promises');
  const path = await import('path');

  console.log('[MiniMax API] 开始调用，API key长度:', apiKey?.length);
  console.log('[MiniMax API] 图片路径:', imagePath);

  // 处理图片路径
  const fullPath = path.join(process.cwd(), 'public', imagePath.replace(/^\//, ''));
  console.log('[MiniMax API] 完整路径:', fullPath);

  const imageBuffer = await fs.readFile(fullPath);
  const base64Image = imageBuffer.toString('base64');
  console.log('[MiniMax API] 图片大小:', imageBuffer.length, 'bytes');

  // 构建请求数据
  const requestData = {
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/jpeg",
              data: base64Image
            }
          },
          {
            type: "text",
            text: prompt
          }
        ]
      }
    ]
  };

  console.log('[MiniMax API] 发送请求到: https://api.minimaxi.com/anthropic/v1/messages');

  // 发送请求
  const response = await fetch('https://api.minimaxi.com/anthropic/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(requestData)
  });

  console.log('[MiniMax API] 响应状态:', response.status);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[MiniMax API] 错误详情:', errorText);
    throw new Error(`MiniMax API错误: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log('[MiniMax API] 调用成功');

  // 解析响应
  const content = data.content[0]?.text || data.content?.[0]?.text || '';

  // 尝试解析JSON格式的响应
  try {
    const parsed = JSON.parse(content);
    return {
      screenUnderstanding: parsed.screen_briefing || '无法理解屏幕内容',
      chips: parsed.chips?.map((c: unknown) => typeof c === 'string' ? c : (c as { text?: string }).text) || []
    };
  } catch {
    // 如果不是JSON格式，尝试提取问题
    return {
      screenUnderstanding: '已分析屏幕内容',
      chips: extractQuestions(content)
    };
  }
}

// 调用GLM-4V API
export async function callGLMVisionAPI(
  imagePath: string,
  prompt: string,
  apiKey: string
): Promise<{ screenUnderstanding: string; chips: string[] }> {
  const fs = await import('fs/promises');
  const path = await import('path');

  const fullPath = path.join(process.cwd(), 'public', imagePath.replace(/^\//, ''));
  const imageBuffer = await fs.readFile(fullPath);
  const base64Image = imageBuffer.toString('base64');

  const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'glm-4v',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`GLM API错误: ${response.status}`);
  }

  const data = await response.json();
  let content = data.choices[0]?.message?.content || '';

  console.log('[GLM API] 原始内容长度:', content.length);
  console.log('[GLM API] 原始内容前200字符:', content.substring(0, 200));

  // GLM有时候会返回markdown格式的JSON，需要清理
  content = content.trim();

  // 移除markdown代码块标记
  content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  // 移除可能的前后引号
  if (content.startsWith('"') || content.startsWith("'")) {
    content = content.substring(1);
  }
  if (content.endsWith('"') || content.endsWith("'")) {
    content = content.slice(0, -1);
  }

  console.log('[GLM API] 清理后的内容:', content);

  try {
    const parsed = JSON.parse(content);
    console.log('[GLM API] JSON解析成功:', JSON.stringify(parsed));

    let chips: string[] = [];

    // 尝试从不同可能的字段提取chips
    if (parsed.chips && Array.isArray(parsed.chips)) {
      chips = parsed.chips.map((c: unknown) => typeof c === 'string' ? c : (c as { text?: string }).text || c).filter(Boolean) as string[];
    }

    console.log('[GLM API] 提取到的chips数量:', chips.length, 'chips:', chips);

    // 如果chips少于2个，生成默认问题
    while (chips.length < 2) {
      console.log('[GLM API] chips不足2个，补充默认问题');
      if (chips.length === 0) chips.push('这张图片有什么有趣的地方？');
      else chips.push('你想了解关于这个的什么信息？');
    }

    // 只取前2个
    chips = chips.slice(0, 2);

    console.log('[GLM API] 最终返回的chips:', chips);

    return {
      screenUnderstanding: parsed.screen_briefing || parsed.screenUnderstanding || '已分析屏幕内容',
      chips
    };
  } catch (parseError) {
    console.log('[GLM API] JSON解析失败，使用智能提取，错误:', parseError);
    // JSON解析失败，智能提取问题
    const extracted = extractQuestions(content);
    console.log('[GLM API] 提取到的问题:', extracted);
    return {
      screenUnderstanding: '已分析屏幕内容',
      chips: extracted.length >= 2 ? extracted : ['这张图片有什么有趣的地方？', '你想了解关于这个的什么信息？']
    };
  }
}

// 从文本中提取问题
function extractQuestions(text: string): string[] {
  const questions: string[] = [];

  console.log('[extractQuestions] 开始提取，文本长度:', text.length);

  // 方法1: 尝试匹配问号结尾的句子
  const sentences = text.split(/[。！？.!?。]/);
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length > 3 && (trimmed.includes('？') || trimmed.includes('?'))) {
      // 移除问号并添加
      const question = trimmed.replace(/[？?]/g, '').trim();
      if (question.length > 0) {
        questions.push(question + '？');
      }
    }
  }

  console.log('[extractQuestions] 通过问号提取到:', questions.length, '个问题');

  // 方法2: 如果问题不足，查找疑问词
  if (questions.length < 2) {
    const questionPatterns = [
      /(?:怎么|如何|什么|为什么|哪|哪儿|是否|能不能|可不可以|可以|要|想|需要)[^？?]{1,10}/g
    ];

    for (const pattern of questionPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        for (const match of matches) {
          const question = match.trim() + '？';
          if (!questions.includes(question) && question.length > 3) {
            questions.push(question);
          }
        }
      }
    }
  }

  console.log('[extractQuestions] 通过疑问词提取到:', questions.length, '个问题');

  // 方法3: 如果还是不足，生成默认问题
  if (questions.length < 2) {
    const defaultQuestions = [
      '这个功能怎么用？',
      '这里有什么特别的吗？',
      '你能解释一下这个吗？',
      '这是什么意思？'
    ];
    questions.push(...defaultQuestions.filter(q => !questions.includes(q)));
  }

  // 去重并只取前2个
  const uniqueQuestions = [...new Set(questions)].slice(0, 2);

  console.log('[extractQuestions] 最终返回:', uniqueQuestions);

  return uniqueQuestions;
}
