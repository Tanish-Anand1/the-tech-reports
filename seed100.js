/**
 * seed100.js — One-time seeder using NewsAPI + OpenAI
 * Run: node seed100.js
 * This fetches 100 real articles and rewrites them with AI.
 */

const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) console.error('Database connection error:', err.message);
    else console.log('Connected to SQLite database for seeding.');
});

const runDb = (query, params = []) => new Promise((resolve, reject) => {
    db.run(query, params, function(err) { if (err) reject(err); else resolve(this); });
});

// Ensure columns exist
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS articles (
        id TEXT PRIMARY KEY, title TEXT, subtitle TEXT, content TEXT,
        category TEXT, author TEXT, location TEXT, image TEXT, status TEXT,
        featured INTEGER, createdAt TEXT, updatedAt TEXT, views INTEGER DEFAULT 0,
        sourceUrl TEXT DEFAULT '', sourcePublisher TEXT DEFAULT ''
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS ticker_headlines (
        id INTEGER PRIMARY KEY AUTOINCREMENT, headline TEXT, createdAt TEXT
    )`);
});

const NEWSAPI_KEY = "7b1dbe422b9e4f2daf4722e178db1b66";
const OPENAI_KEY = "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";

const QUERIES = [
    { q: "artificial intelligence", cat: "Technology" },
    { q: "AI startups funding", cat: "Startups" },
    { q: "machine learning deep learning", cat: "Technology" },
    { q: "OpenAI ChatGPT Claude", cat: "Technology" },
    { q: "Google DeepMind AI", cat: "Technology" },
    { q: "tech startup venture capital", cat: "Startups" },
    { q: "electric vehicles battery", cat: "Technology" },
    { q: "cryptocurrency bitcoin blockchain", cat: "Business" },
    { q: "cybersecurity data breach", cat: "Technology" },
    { q: "Apple Samsung smartphone", cat: "Technology" },
    { q: "quantum computing IBM Google", cat: "Technology" },
    { q: "robotics automation factory", cat: "Technology" },
    { q: "SpaceX NASA space", cat: "World News" },
    { q: "semiconductor TSMC chips", cat: "Business" },
    { q: "cloud computing AWS Azure", cat: "Technology" },
    { q: "fintech digital banking", cat: "Business" },
    { q: "social media TikTok Instagram", cat: "Entertainment" },
    { q: "VR AR mixed reality", cat: "Technology" },
    { q: "climate tech clean energy", cat: "World News" },
    { q: "biotech genomics health tech", cat: "Technology" },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchNews(query, pageSize = 5) {
    const d = new Date(); d.setDate(d.getDate() - 3);
    const from = d.toISOString().split('T')[0];
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&from=${from}&sortBy=popularity&pageSize=${pageSize}&language=en&apiKey=${NEWSAPI_KEY}`;
    try {
        const r = await fetch(url);
        if (!r.ok) return [];
        const data = await r.json();
        return (data.articles || []).filter(a => a.title && a.title !== '[Removed]' && a.description && a.urlToImage);
    } catch (e) { return []; }
}

async function rewrite(article) {
    const prompt = `You are a senior editor at "The Tech Reports". Rewrite this news into a professional editorial article.

HEADLINE: ${article.title}
DESCRIPTION: ${article.description}
SNIPPET: ${article.content || ''}
SOURCE: ${article.source?.name || 'Unknown'}

Return ONLY a JSON object with: "title" (new compelling headline), "subtitle" (one-sentence summary), "content" (3-4 paragraphs separated by \\n\\n), "location" (best-guess city).`;

    try {
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: "Output pure JSON only." },
                    { role: "user", content: prompt }
                ],
                temperature: 0.7
            })
        });
        if (!r.ok) return null;
        const res = await r.json();
        let text = res.choices[0].message.content.replace(/```json/gi, '').replace(/```/g, '').trim();
        const m = text.match(/\{[\s\S]*\}/);
        if (m) text = m[0];
        return JSON.parse(text);
    } catch (e) { return null; }
}

async function main() {
    console.log("=========================================");
    console.log(" SEEDING 100 REAL NEWS ARTICLES");
    console.log(" NewsAPI → OpenAI → SQLite");
    console.log("=========================================\n");

    let allRaw = [];
    
    // Phase 1: Fetch from NewsAPI
    for (const { q, cat } of QUERIES) {
        process.stdout.write(`Fetching "${q}"... `);
        const articles = await fetchNews(q, 6);
        articles.forEach(a => { a._cat = cat; });
        allRaw.push(...articles);
        console.log(`${articles.length} found`);
        await sleep(300);
    }

    // Deduplicate
    const seen = new Set();
    allRaw = allRaw.filter(a => {
        const key = a.title.toLowerCase().trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).slice(0, 100);

    console.log(`\nTotal unique articles: ${allRaw.length}`);
    console.log("Starting AI rewrite phase...\n");

    // Phase 2: Rewrite + Insert
    let inserted = 0;
    const now = new Date();
    const startTime = new Date(now);
    startTime.setHours(5, 0, 0, 0);
    const interval = (18 * 60 * 60 * 1000) / Math.max(allRaw.length, 1);

    for (let i = 0; i < allRaw.length; i++) {
        const raw = allRaw[i];
        process.stdout.write(`[${i+1}/${allRaw.length}] Rewriting: "${raw.title.substring(0, 55)}..." `);

        const rewritten = await rewrite(raw);
        const pubTime = new Date(startTime.getTime() + (i * interval));
        const id = `art-${Date.now()}-${Math.floor(Math.random() * 9999)}`;

        if (rewritten) {
            try {
                await runDb(
                    `INSERT OR IGNORE INTO articles (id, title, subtitle, content, category, author, location, image, status, featured, createdAt, updatedAt, views, sourceUrl, sourcePublisher)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
                    [id, rewritten.title, rewritten.subtitle, rewritten.content, raw._cat,
                     'TTR AI Desk', rewritten.location || 'Global', raw.urlToImage || '',
                     'published', i < 5 ? 1 : 0, pubTime.toISOString(), pubTime.toISOString(),
                     raw.url || '', raw.source?.name || '']
                );
                inserted++;
                console.log("✓");
            } catch (e) { console.log("✗ DB error"); }
        } else {
            // Fallback: use original
            try {
                await runDb(
                    `INSERT OR IGNORE INTO articles (id, title, subtitle, content, category, author, location, image, status, featured, createdAt, updatedAt, views, sourceUrl, sourcePublisher)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
                    [id, raw.title, raw.description, raw.content || raw.description, raw._cat,
                     raw.author || 'TTR Desk', 'Global', raw.urlToImage || '',
                     'published', 0, pubTime.toISOString(), pubTime.toISOString(),
                     raw.url || '', raw.source?.name || '']
                );
                inserted++;
                console.log("→ fallback");
            } catch (e) { console.log("✗"); }
        }

        if (i % 5 === 4) await sleep(1500);
        else await sleep(600);
    }

    // Update ticker
    try {
        const r = await fetch(`https://newsapi.org/v2/top-headlines?country=us&category=technology&pageSize=8&apiKey=${NEWSAPI_KEY}`);
        if (r.ok) {
            const data = await r.json();
            for (const h of (data.articles || []).slice(0, 8)) {
                if (h.title && h.title !== '[Removed]')
                    await runDb('INSERT INTO ticker_headlines (headline, createdAt) VALUES (?, ?)', [h.title, now.toISOString()]);
            }
        }
    } catch (e) {}

    console.log(`\n=========================================`);
    console.log(` SEED COMPLETE: ${inserted} articles inserted`);
    console.log(`=========================================`);
    db.close();
}

main();
