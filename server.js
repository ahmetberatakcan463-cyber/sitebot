const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { nanoid } = require('nanoid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4000;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Hafızada tutulan siteler: { id: { html, title, prompt, createdAt } }
const sites = {};

const SYSTEM_PROMPT = `Sen bir profesyonel web geliştiricisin. Kullanıcı sana bir web sitesi veya sayfa açıklaması verir, sen de tam anlamıyla çalışan, görsel olarak etkileyici, tek dosyalı bir HTML sayfası üretirsin.

KURALLAR:
- SADECE HTML kodu döndür. Hiçbir açıklama, yorum veya markdown kod bloğu (backtick) yazma.
- Tüm CSS'i <style> tag'i içine yaz, tüm JavaScript'i <script> tag'i içine yaz.
- Hiçbir zaman external CSS/JS dosyasına link verme (CDN fontları ve icon kütüphaneleri hariç).
- Sayfa modern, responsive ve görsel olarak çarpıcı olsun.
- Türkçe içerik kullan.
- Gerçekçi placeholder içerik ekle (Lorem ipsum değil, konuyla ilgili gerçek gibi duran içerik).
- Formlar görsel olarak çalışıyor gibi dursun.
- Google Fonts veya system fonts kullan.
- Gradient, gölge, animasyon gibi modern CSS özelliklerini bolca kullan.
- Renk paleti tutarlı ve profesyonel olsun.
- Navbar, footer ve diğer bölümler tam ve detaylı olsun.`;

// Site oluşturma (streaming)
app.post('/api/generate', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt gerekli' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    sendEvent({ type: 'status', message: 'Site oluşturuluyor...' });

    let fullHtml = '';

    const stream = client.messages.stream({
      model: 'claude-opus-4-6',
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        fullHtml += event.delta.text;
        sendEvent({ type: 'chunk', text: event.delta.text });
      }
    }

    // Markdown kod bloklarını temizle
    fullHtml = fullHtml
      .replace(/^```html\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const id = nanoid(8);
    const titleMatch = fullHtml.match(/<title[^>]*>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : 'Oluşturulan Site';

    sites[id] = { html: fullHtml, title, prompt, createdAt: new Date() };

    sendEvent({ type: 'done', id, title });
    res.end();
  } catch (err) {
    console.error(err);
    let msg = 'Bir hata oluştu.';
    if (err instanceof Anthropic.AuthenticationError) {
      msg = 'API anahtarı geçersiz. ANTHROPIC_API_KEY değerini kontrol et.';
    } else if (err instanceof Anthropic.RateLimitError) {
      msg = 'Çok fazla istek. Biraz bekleyip tekrar dene.';
    } else if (err.message) {
      msg = err.message;
    }
    sendEvent({ type: 'error', message: msg });
    res.end();
  }
});

// Tüm siteleri listele
app.get('/api/sites', (req, res) => {
  const list = Object.entries(sites)
    .map(([id, s]) => ({
      id,
      title: s.title,
      prompt: s.prompt,
      createdAt: s.createdAt,
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(list);
});

// Belirli bir siteyi sil
app.delete('/api/sites/:id', (req, res) => {
  if (sites[req.params.id]) {
    delete sites[req.params.id];
    res.json({ ok: true });
  } else {
    res.status(404).json({ error: 'Site bulunamadı' });
  }
});

// Oluşturulan siteyi sun
app.get('/s/:id', (req, res) => {
  const site = sites[req.params.id];
  if (!site) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html lang="tr">
      <head><meta charset="UTF-8"><title>Site Bulunamadı</title>
      <style>body{font-family:sans-serif;text-align:center;padding:60px;background:#0f0f1a;color:#fff}
      a{color:#7c3aed}</style></head>
      <body><h2>Site bulunamadı</h2><p>"${req.params.id}" ID'li site mevcut değil.</p>
      <a href="/">Ana sayfaya dön</a></body></html>
    `);
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(site.html);
});

app.listen(PORT, () => {
  console.log(`\n✅ Site Yapıcı çalışıyor: http://localhost:${PORT}`);
  console.log(`   ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? '✅ Ayarlanmış' : '❌ Eksik!'}\n`);
});
