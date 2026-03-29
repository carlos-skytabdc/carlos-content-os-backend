module.exports = async function handler(req, res) {
  // CORS headers for cross-origin requests from GitHub Pages
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY' });
  const { hook = '', notes = '', tag = '', bilingual = false } = req.body || {};
  if (!hook.trim()) return res.status(400).json({ error: 'Missing hook' });

  const bilingualNote = bilingual
    ? `\n\nAlso include a Spanish (bilingual) version for each platform draft at the end of that draft's copy, separated by a line break and prefixed with "🇪🇸 Español:".`
    : '';

  const prompt = `You are Carlos's personal content strategist. Carlos works in hospitality technology and payments, serving restaurants, bars, and hospitality operators in the DMV area. He is bilingual (English/Spanish).

His voice is: conversational but sharp, confident not arrogant, observational not preachy, professional not corporate-stiff, educational and empowering, simple language with strong insight.

His positioning: operator-minded, educational not promotional, authority over virality, insight over noise, clarity over complexity. Nothing should read as a sales pitch or create conflict of interest.

Core idea: "${hook}"
Additional notes: "${notes || 'None'}"
Topic: ${tag || 'operator insight'}${bilingualNote}

Return ONLY valid JSON with keys linkedin, instagram, facebook, tiktok. Each must include copy and note. LinkedIn and Instagram may also include hashtags.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await r.json();
    if (!r.ok) {
      return res.status(502).json({ error: 'Anthropic API error', status: r.status, detail: data });
    }
    const text = (data.content || []).map(x => x.text || '').join('').replace(/```json|```/g, '').trim();
    if (!text) {
      return res.status(502).json({ error: 'Empty response from Anthropic', detail: data });
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (parseErr) {
      return res.status(502).json({ error: 'Failed to parse AI response as JSON', raw: text.substring(0, 500) });
    }

    // Flatten so the front end gets { linkedin, instagram, facebook, tiktok } strings
    const flat = {};
    for (const [platform, val] of Object.entries(parsed)) {
      if (typeof val === 'string') {
        flat[platform] = val;
      } else if (val && typeof val === 'object') {
        let parts = [];
        if (val.copy) parts.push(val.copy);
        if (val.hashtags) parts.push(val.hashtags);
        if (val.note) parts.push('\n— Note: ' + val.note);
        flat[platform] = parts.join('\n\n');
      }
    }
    return res.status(200).json(flat);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Generation failed' });
  }
};
