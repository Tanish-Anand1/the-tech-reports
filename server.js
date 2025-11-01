require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
});

// Block admin.html from being indexed
app.get('/admin.html', (req, res) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.use(express.static(__dirname));

// ==========================================
// 1. DATABASE SETUP
// ==========================================
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) console.error('Database connection error:', err.message);
    else console.log('Connected to SQLite database.');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS articles (
        id TEXT PRIMARY KEY,
        title TEXT,
        subtitle TEXT,
        content TEXT,
        category TEXT,
        author TEXT,
        location TEXT,
        image TEXT,
        status TEXT,
        featured INTEGER,
        createdAt TEXT,
        updatedAt TEXT,
        views INTEGER DEFAULT 0,
        sourceUrl TEXT DEFAULT '',
        sourcePublisher TEXT DEFAULT ''
    )`);

    // Add columns if they don't exist (for existing DBs)
    db.run(`ALTER TABLE articles ADD COLUMN sourceUrl TEXT DEFAULT ''`, () => {});
    db.run(`ALTER TABLE articles ADD COLUMN sourcePublisher TEXT DEFAULT ''`, () => {});

    db.run(`CREATE TABLE IF NOT EXISTS subscribers (
        email TEXT PRIMARY KEY,
        subscribedAt TEXT,
        status TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS ticker_headlines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        headline TEXT,
        createdAt TEXT
    )`);
});

// Helper for DB Queries
const all = (query, params = []) => new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => { if (err) reject(err); else resolve(rows); });
});
const run = (query, params = []) => new Promise((resolve, reject) => {
    db.run(query, params, function(err) { if (err) reject(err); else resolve(this); });
});
const get = (query, params = []) => new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => { if (err) reject(err); else resolve(row); });
});

// ==========================================
// 2. API ENDPOINTS
// ==========================================

const requireAdmin = (req, res, next) => {
    const auth = req.headers.authorization;
    if (auth === 'Bearer iwillbemorerichthanelonmusk') {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

app.get('/api/articles', async (req, res) => {
    try {
        const rows = await all('SELECT * FROM articles ORDER BY createdAt DESC');
        res.json(rows.map(r => ({ ...r, featured: !!r.featured })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/articles/:id', async (req, res) => {
    try {
        const row = await get('SELECT * FROM articles WHERE id = ?', [req.params.id]);
        if (!row) return res.status(404).json({ error: 'Article not found' });
        await run('UPDATE articles SET views = views + 1 WHERE id = ?', [req.params.id]);
        row.views += 1;
        row.featured = !!row.featured;
        res.json(row);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/articles', requireAdmin, async (req, res) => {
    const { id, title, subtitle, content, category, author, location, image, status, featured, createdAt, updatedAt, sourceUrl, sourcePublisher } = req.body;
    try {
        await run(`INSERT INTO articles (id, title, subtitle, content, category, author, location, image, status, featured, createdAt, updatedAt, views, sourceUrl, sourcePublisher) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`, 
                   [id, title, subtitle, content, category, author, location, image, status, featured ? 1 : 0, createdAt, updatedAt, sourceUrl || '', sourcePublisher || '']);
        res.json({ success: true, id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/articles/:id', requireAdmin, async (req, res) => {
    const { title, subtitle, content, category, author, location, image, status, updatedAt } = req.body;
    try {
        await run(`UPDATE articles SET title=?, subtitle=?, content=?, category=?, author=?, location=?, image=?, status=?, updatedAt=? WHERE id=?`,
                  [title, subtitle, content, category, author, location, image, status, updatedAt, req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/articles/:id', requireAdmin, async (req, res) => {
    try {
        await run('DELETE FROM articles WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/subscribe', async (req, res) => {
    const { email } = req.body;
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'Invalid email' });
    try {
        await run('INSERT OR IGNORE INTO subscribers (email, subscribedAt, status) VALUES (?, ?, ?)', [email, new Date().toISOString(), 'active']);
        res.json({ success: true, message: 'Subscribed!' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Ticker headlines endpoint
app.get('/api/ticker', async (req, res) => {
    try {
        const rows = await all('SELECT headline FROM ticker_headlines ORDER BY createdAt DESC LIMIT 8');
        if (rows.length > 0) {
            res.json(rows.map(r => r.headline));
        } else {
            const articles = await all('SELECT title FROM articles WHERE status="published" ORDER BY createdAt DESC LIMIT 8');
            res.json(articles.map(a => a.title));
        }
    } catch (err) { res.json([]); }
});

// Admin manual triggers
app.post('/api/admin/scrape', requireAdmin, async (req, res) => {
    res.json({ success: true, message: 'Scrape started in background' });
    runFullScrape();
});

app.post('/api/admin/agent', requireAdmin, async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });
    
    try {
        // Use OpenAI to parse the intent
        const completion = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_KEY}` },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: "You are a news topic extraction agent. The user will give you a command to scrape news. Return ONLY a JSON object with two fields: 'query' (the exact search phrase for NewsAPI, e.g. 'Elon Musk' or 'Indian fintech') and 'category' (one of: Technology, World News, India, Business, Startups, Opinion, Sports, Entertainment). Example: {\"query\": \"Indian fintech startups\", \"category\": \"Startups\"}" },
                    { role: "user", content: prompt }
                ]
            })
        });
        const data = await completion.json();
        const rawContent = data.choices[0].message.content.trim();
        const jsonStr = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
        const intent = JSON.parse(jsonStr);
        
        const articlesRaw = await fetchNewsFromAPI(intent.query, 10);
        const validArticles = articlesRaw.filter(a => a.content && a.content.length > 50);
        
        let count = 0;
        for (let i = 0; i < Math.min(validArticles.length, 5); i++) {
            const raw = validArticles[i];
            const rewritten = await rewriteWithOpenAI(raw, intent.category);
            
            if (rewritten) {
                const id = `art-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
                const now = new Date().toISOString();
                try {
                    await run(
                        `INSERT OR IGNORE INTO articles (id, title, subtitle, content, category, author, location, image, status, featured, createdAt, updatedAt, views, sourceUrl, sourcePublisher)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
                        [id, rewritten.title, rewritten.subtitle, rewritten.content, intent.category,
                         rewritten.author || 'TTR AI Desk', rewritten.location || 'Global',
                         raw.urlToImage || '', 'published', 0, now, now,
                         raw.url || '', raw.source?.name || '']
                    );
                    count++;
                } catch (e) { console.error('[Agent] DB error:', e.message); }
            }
            await sleep(1000);
        }
        res.json({ success: true, count, topic: intent.query });
    } catch (err) {
        console.error("Agent error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 3. NEWSAPI + OPENAI SCRAPING ENGINE
// ==========================================

const NEWSAPI_KEY = "7b1dbe422b9e4f2daf4722e178db1b66";
const OPENAI_KEY = "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";

const NEWS_QUERIES = [
    "artificial intelligence", "AI startups", "machine learning breakthrough",
    "OpenAI ChatGPT", "Google Gemini AI", "tech startup funding",
    "electric vehicles Tesla", "cryptocurrency Bitcoin", "cybersecurity breach",
    "Apple iPhone", "quantum computing", "robotics automation",
    "space exploration SpaceX", "semiconductor chips", "cloud computing",
    "fintech digital payments", "social media platforms", "VR AR metaverse",
    "climate tech renewable energy", "biotech health innovation"
];

const CATEGORIES_MAP = {
    "artificial intelligence": "Technology", "AI startups": "Startups",
    "machine learning breakthrough": "Technology", "OpenAI ChatGPT": "Technology",
    "Google Gemini AI": "Technology", "tech startup funding": "Startups",
    "electric vehicles Tesla": "Technology", "cryptocurrency Bitcoin": "Business",
    "cybersecurity breach": "Technology", "Apple iPhone": "Technology",
    "quantum computing": "Technology", "robotics automation": "Technology",
    "space exploration SpaceX": "World News", "semiconductor chips": "Business",
    "cloud computing": "Technology", "fintech digital payments": "Business",
    "social media platforms": "Entertainment", "VR AR metaverse": "Technology",
    "climate tech renewable energy": "World News", "biotech health innovation": "Technology"
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchNewsFromAPI(query, pageSize = 5) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 2);
    const fromDate = yesterday.toISOString().split('T')[0];

    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&from=${fromDate}&sortBy=popularity&pageSize=${pageSize}&language=en&apiKey=${NEWSAPI_KEY}`;
    
    try {
        const resp = await fetch(url);
        if (!resp.ok) { console.log(`[NewsAPI] Error for "${query}": ${resp.status}`); return []; }
        const data = await resp.json();
        return (data.articles || []).filter(a => a.title && a.title !== '[Removed]' && a.description && a.urlToImage);
    } catch (e) {
        console.error(`[NewsAPI] Fetch error for "${query}":`, e.message);
        return [];
    }
}

async function rewriteWithOpenAI(article, category) {
    const prompt = `You are a senior editor at "The Tech Reports", a premium technology publication.

Rewrite this news article in your own words. Make it professional, authoritative, and engaging.

ORIGINAL HEADLINE: ${article.title}
ORIGINAL DESCRIPTION: ${article.description}
ORIGINAL CONTENT SNIPPET: ${article.content || ''}
SOURCE: ${article.source?.name || 'Unknown'}
AUTHOR: ${article.author || 'Staff'}

Return ONLY a valid JSON object (no markdown, no backticks) with these fields:
- "title": A compelling, professional headline (different from original, no clickbait)
- "subtitle": A strong one-sentence summary
- "content": 3-4 paragraphs of well-written editorial prose. Separate paragraphs with \\n\\n. Do NOT copy original text verbatim.
- "author": "TTR AI Desk"
- "location": Best-guess city based on the story (e.g., San Francisco, New Delhi, London, Global)`;

    try {
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: "You output pure JSON objects only. No markdown." },
                    { role: "user", content: prompt }
                ],
                temperature: 0.7
            })
        });

        if (!resp.ok) return null;
        const result = await resp.json();
        let reply = result.choices[0].message.content;
        
        // Clean JSON
        reply = reply.replace(/```json/gi, '').replace(/```/g, '').trim();
        const objMatch = reply.match(/\{[\s\S]*\}/);
        if (objMatch) reply = objMatch[0];
        
        return JSON.parse(reply);
    } catch (e) {
        console.error('[OpenAI] Rewrite error:', e.message);
        return null;
    }
}

async function runFullScrape(articleCount = 100) {
    console.log(`\n[SCRAPER] ========================================`);
    console.log(`[SCRAPER] Starting full news scrape (target: ${articleCount} articles)`);
    console.log(`[SCRAPER] ========================================\n`);

    let allRawArticles = [];
    const perQuery = Math.ceil(articleCount / NEWS_QUERIES.length);

    // Phase 1: Fetch from NewsAPI
    for (const query of NEWS_QUERIES) {
        console.log(`[SCRAPER] Fetching: "${query}" (${perQuery} articles)...`);
        const articles = await fetchNewsFromAPI(query, perQuery);
        articles.forEach(a => { a._query = query; });
        allRawArticles.push(...articles);
        await sleep(250); // Rate limit
    }

    // Deduplicate by title
    const seen = new Set();
    allRawArticles = allRawArticles.filter(a => {
        const key = a.title.toLowerCase().trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Limit to target count
    allRawArticles = allRawArticles.slice(0, articleCount);
    console.log(`[SCRAPER] Fetched ${allRawArticles.length} unique articles from NewsAPI`);

    // Phase 2: Rewrite with OpenAI + stagger insert times
    let inserted = 0;
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(5, 0, 0, 0); // Start from 5 AM
    const intervalMs = (18 * 60 * 60 * 1000) / Math.max(allRawArticles.length, 1); // Spread across 18 hours

    for (let i = 0; i < allRawArticles.length; i++) {
        const raw = allRawArticles[i];
        const category = CATEGORIES_MAP[raw._query] || "Technology";

        console.log(`[SCRAPER] [${i + 1}/${allRawArticles.length}] Rewriting: "${raw.title.substring(0, 60)}..."`);

        const rewritten = await rewriteWithOpenAI(raw, category);
        
        if (rewritten) {
            const staggeredTime = new Date(startOfDay.getTime() + (i * intervalMs));
            const id = `art-${Date.now()}-${Math.floor(Math.random() * 9999)}`;

            try {
                await run(
                    `INSERT OR IGNORE INTO articles (id, title, subtitle, content, category, author, location, image, status, featured, createdAt, updatedAt, views, sourceUrl, sourcePublisher)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
                    [
                        id,
                        rewritten.title,
                        rewritten.subtitle,
                        rewritten.content,
                        category,
                        rewritten.author || 'TTR AI Desk',
                        rewritten.location || 'Global',
                        raw.urlToImage || '',
                        'published',
                        i < 5 ? 1 : 0, // First 5 are featured
                        staggeredTime.toISOString(),
                        staggeredTime.toISOString(),
                        raw.url || '',
                        raw.source?.name || ''
                    ]
                );
                inserted++;
            } catch (dbErr) {
                console.error(`[SCRAPER] DB insert error:`, dbErr.message);
            }
        } else {
            // Fallback: use original content if OpenAI fails
            const staggeredTime = new Date(startOfDay.getTime() + (i * intervalMs));
            const id = `art-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
            try {
                await run(
                    `INSERT OR IGNORE INTO articles (id, title, subtitle, content, category, author, location, image, status, featured, createdAt, updatedAt, views, sourceUrl, sourcePublisher)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
                    [id, raw.title, raw.description, raw.content || raw.description, category, 'TTR Desk', 'Global', raw.urlToImage || '', 'published', 0, staggeredTime.toISOString(), staggeredTime.toISOString(), raw.url || '', raw.source?.name || '']
                );
                inserted++;
            } catch (e) {}
        }

        // Rate limit OpenAI calls
        if (i % 5 === 4) await sleep(1500);
        else await sleep(500);
    }

    // Phase 3: Update ticker headlines
    try {
        await run('DELETE FROM ticker_headlines');
        const topHeadlinesResp = await fetch(`https://newsapi.org/v2/top-headlines?country=us&category=technology&pageSize=8&apiKey=${NEWSAPI_KEY}`);
        if (topHeadlinesResp.ok) {
            const topData = await topHeadlinesResp.json();
            for (const h of (topData.articles || []).slice(0, 8)) {
                if (h.title && h.title !== '[Removed]') {
                    await run('INSERT INTO ticker_headlines (headline, createdAt) VALUES (?, ?)', [h.title, new Date().toISOString()]);
                }
            }
        }
    } catch (e) { console.error('[SCRAPER] Ticker update error:', e.message); }

    console.log(`\n[SCRAPER] ========================================`);
    console.log(`[SCRAPER] COMPLETE: Inserted ${inserted} articles`);
    console.log(`[SCRAPER] ========================================\n`);
    return inserted;
}

// ==========================================
// 4. EMAIL DISPATCH
// ==========================================

async function runDailyEmail() {
    console.log('[CRON] Starting Daily Newsletter Email...');
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.log('[CRON] Skipping Email: EMAIL_USER and EMAIL_PASS not set.');
        return;
    }
    try {
        const subs = await all("SELECT email FROM subscribers WHERE status='active'");
        if (subs.length === 0) return;
        const topArticles = await all("SELECT * FROM articles WHERE status='published' ORDER BY createdAt DESC LIMIT 5");
        if (topArticles.length === 0) return;

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
        });

        let htmlBody = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;color:#1a1a1a;">
            <div style="text-align:center;padding:30px 20px;background:#0f1923;color:#fff;">
                <h1 style="margin:0;font-size:28px;">The Tech <em>Reports</em></h1>
                <p style="margin:5px 0 0;font-size:14px;opacity:0.8;">DAILY BRIEFING</p>
            </div>
            <div style="padding:30px;">
                <p>Top technology and innovation stories shaping the world today.</p>
                <hr style="border:0;border-top:1px solid #e0e0e0;margin:25px 0;">`;

        topArticles.forEach(a => {
            htmlBody += `<div style="margin-bottom:30px;">
                ${a.image ? `<img src="${a.image}" style="width:100%;max-height:200px;object-fit:cover;margin-bottom:10px;">` : ''}
                <div style="font-size:12px;font-weight:bold;color:#cc2936;">${(a.category || '').toUpperCase()}</div>
                <h2 style="margin:4px 0 10px;font-size:20px;">${a.title}</h2>
                <p style="margin:0;font-size:15px;color:#666;">${a.subtitle || (a.content || '').substring(0, 120) + '...'}</p>
            </div>`;
        });
        htmlBody += `</div></div>`;

        await transporter.sendMail({
            from: `"The Tech Reports" <${process.env.EMAIL_USER}>`,
            bcc: subs.map(s => s.email).join(','),
            subject: "TTR Daily: " + topArticles[0].title.substring(0, 50) + "...",
            html: htmlBody
        });
        console.log(`[CRON] Sent daily email to ${subs.length} subscribers.`);
    } catch (err) { console.error('[CRON] Email Error:', err.message); }
}

// ==========================================
// 5. CRON JOBS
// ==========================================

// Daily scrape at 4:00 AM — fetches & rewrites 100 articles
cron.schedule('0 4 * * *', () => { runFullScrape(100); });
// Daily email at 7:00 AM
cron.schedule('0 7 * * *', runDailyEmail);

// ==========================================
// 6. ADMIN ENDPOINTS
// ==========================================

app.post('/api/admin/scrape', async (req, res) => {
    const count = req.body.count || 100;
    runFullScrape(count);
    res.json({ success: true, message: `Scraping ${count} articles initiated.` });
});

app.post('/api/admin/email', async (req, res) => {
    runDailyEmail();
    res.json({ success: true, message: "Email dispatch initiated." });
});

app.post('/api/admin/clear', async (req, res) => {
    try {
        await run('DELETE FROM articles');
        res.json({ success: true, message: 'All articles cleared.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 7. START SERVER
// ==========================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n==========================================`);
    console.log(`🚀 THE TECH REPORTS v3 — PORT ${PORT}`);
    console.log(`   NewsAPI + OpenAI Automated Pipeline`);
    console.log(`==========================================\n`);
});
