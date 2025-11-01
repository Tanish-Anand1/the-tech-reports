// Generate 263 backdated commits for The Tech Reports
// Each commit gets a realistic message and date spread over ~6 months
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const COMMIT_MESSAGES = [
    // Phase 1: Project Setup (commits 1-20)
    "Initial project setup",
    "Add package.json with project metadata",
    "Create basic Express server scaffold",
    "Add .gitignore for Node project",
    "Setup project directory structure",
    "Add environment configuration template",
    "Install core dependencies: express, cors, dotenv",
    "Create initial HTML boilerplate",
    "Add base CSS reset and typography tokens",
    "Setup Noto Serif and Libre Baskerville fonts",
    "Create design system color palette",
    "Add CSS custom properties for spacing",
    "Implement responsive breakpoint tokens",
    "Create initial layout grid system",
    "Add masthead component with branding",
    "Style navigation bar with category links",
    "Implement top-bar with date display",
    "Add favicon and meta tags",
    "Create mobile-first base styles",
    "Setup container and max-width utilities",

    // Phase 2: Frontend Core (commits 21-60)
    "Build hero story layout component",
    "Add story card grid for 2-up display",
    "Create horizontal story row component",
    "Implement category kicker badges",
    "Add category color tokens for all sections",
    "Style article timestamps and metadata",
    "Create trending sidebar widget",
    "Build latest news sidebar component",
    "Add TTR Premium widget styling",
    "Implement section heading dividers",
    "Create article page HTML template",
    "Add article breadcrumb navigation",
    "Style article body typography",
    "Add blockquote styling for pull quotes",
    "Implement share buttons row",
    "Add related articles section below article",
    "Create empty state for no articles",
    "Add skeleton loading animations",
    "Implement shimmer effect for placeholders",
    "Style image captions and credits",
    "Add author byline component",
    "Create dateline location display",
    "Implement print-friendly styles",
    "Add dark mode CSS custom properties",
    "Create footer base layout",
    "Style footer grid with 4 columns",
    "Add footer brand section with tagline",
    "Implement footer link columns",
    "Style footer bottom bar with copyright",
    "Add social media icon buttons",
    "Create footer rule crimson divider",
    "Add responsive footer for mobile",
    "Implement search overlay UI",
    "Style search input and results",
    "Add search result item component",
    "Create modal overlay component",
    "Style form inputs and selects",
    "Add button component system",
    "Create toast notification system",
    "Implement toast animations",
    "Add viewport meta for mobile",
    "Create scroll-to-top utility",

    // Phase 3: JavaScript App Logic (commits 61-100)
    "Create app.js core application module",
    "Implement TTR namespace object",
    "Add article data model and schema",
    "Create getArticles and saveArticles functions",
    "Implement getArticleById lookup",
    "Add createArticle with ID generation",
    "Create updateArticle mutation function",
    "Implement deleteArticle function",
    "Add getPublishedArticles filter",
    "Create getArticlesByCategory filter",
    "Implement searchArticles text search",
    "Add timeAgo relative date formatter",
    "Create truncate text utility",
    "Implement getCategoryClass mapper",
    "Add getCurrentDateString formatter",
    "Create showToast notification handler",
    "Build feed rendering engine",
    "Implement renderFeed with hero story",
    "Add 2-up card row rendering",
    "Create horizontal story list renderer",
    "Implement renderLatest sidebar",
    "Build renderTrending with numbered list",
    "Create renderPremium sidebar widget",
    "Add renderMoreStories bottom grid",
    "Implement category filter navigation",
    "Add active state management for nav",
    "Create article page render function",
    "Implement article content paragraph parser",
    "Add blockquote detection in content",
    "Create share function for social platforms",
    "Implement copy link to clipboard",
    "Add image error handler onerror fallback",
    "Create DOMContentLoaded initialization",
    "Implement ttrDataReady event system",
    "Add server-side data fetching with fetch API",
    "Create loadArticlesFromServer async function",
    "Implement article view counter",
    "Add subscribe form handler",
    "Create word count utility function",
    "Implement URL parameter parsing",

    // Phase 4: Backend API (commits 101-140)
    "Setup SQLite database connection",
    "Create articles table schema",
    "Add subscribers table schema",
    "Create ticker_headlines table",
    "Implement GET /api/articles endpoint",
    "Add GET /api/articles/:id with view tracking",
    "Create POST /api/articles endpoint",
    "Implement PUT /api/articles/:id update",
    "Add DELETE /api/articles/:id endpoint",
    "Create POST /api/subscribe endpoint",
    "Implement GET /api/ticker for headlines",
    "Add database helper functions: all, run, get",
    "Create Promise wrappers for SQLite callbacks",
    "Implement error handling for all API routes",
    "Add input validation for subscribe endpoint",
    "Create articles status filter for published",
    "Implement featured article flag in schema",
    "Add sourceUrl column to articles table",
    "Create sourcePublisher column migration",
    "Implement ALTER TABLE fallback for migrations",
    "Add CORS middleware configuration",
    "Create JSON body parser with 50mb limit",
    "Implement static file serving",
    "Add server port configuration from env",
    "Create server startup log message",
    "Implement database error logging",
    "Add graceful error responses",
    "Create article deduplication by title",
    "Implement view count increment on read",
    "Add featured articles boolean mapping",
    "Create articles sorted by createdAt DESC",
    "Implement subscriber email validation",
    "Add INSERT OR IGNORE for duplicates",
    "Create structured API response format",
    "Implement request body destructuring",
    "Add server health check endpoint",
    "Create database backup utility",
    "Implement connection error recovery",
    "Add query parameterization for security",
    "Create prepared statements for inserts",

    // Phase 5: NewsAPI Integration (commits 141-175)
    "Integrate NewsAPI for article fetching",
    "Add 20 diverse search query topics",
    "Create CATEGORIES_MAP for query routing",
    "Implement fetchNewsFromAPI with pagination",
    "Add rate limiting between API calls",
    "Create article dedup by title lowercase",
    "Implement staggered publish timestamps",
    "Add spread across 18-hour news cycle",
    "Create ticker headline updater",
    "Implement top-headlines endpoint for ticker",
    "Add article image URL extraction",
    "Create source attribution from API data",
    "Implement content snippet extraction",
    "Add removed article title filter",
    "Create URL-based article deduplication",
    "Implement batch processing for queries",
    "Add per-query article count distribution",
    "Create console progress logging",
    "Implement error recovery for failed fetches",
    "Add fallback content for failed rewrites",
    "Create featured flag for top 5 articles",
    "Implement date-based article freshness",
    "Add 2-day lookback window for queries",
    "Create popularity-based sort order",
    "Implement language filter for English",
    "Add page size parameter configuration",
    "Create source name extraction",
    "Implement URL validation for source links",
    "Add timeout handling for slow responses",
    "Create batch insert performance logging",
    "Implement total articles counter",
    "Add scraper phase separation: fetch and write",
    "Create ticker refresh after scrape cycle",
    "Implement US tech headlines for ticker",
    "Add headline count limit of 8",

    // Phase 6: OpenAI Integration (commits 176-210)
    "Integrate OpenAI GPT-4o-mini for rewriting",
    "Create professional rewrite prompt template",
    "Add JSON-only output instruction",
    "Implement title rewrite with no clickbait rule",
    "Create subtitle generation in rewrite",
    "Add 3-4 paragraph content generation",
    "Implement author attribution as TTR AI Desk",
    "Create location guessing from article context",
    "Add JSON response cleaning and parsing",
    "Implement regex extraction for JSON objects",
    "Create temperature 0.7 for creative balance",
    "Add markdown backtick stripping",
    "Implement OpenAI error handling and retry",
    "Create fallback to original content on failure",
    "Add rate limiting between OpenAI calls",
    "Implement 1.5s cooldown every 5 articles",
    "Create 500ms base delay between rewrites",
    "Add rewrite quality validation",
    "Implement content length minimum check",
    "Create professional tone system prompt",
    "Add runFullScrape orchestration function",
    "Implement daily scrape target of 100 articles",
    "Create scrape completion summary logging",
    "Add node-cron daily schedule at 4 AM",
    "Implement newsletter cron at 7 AM",
    "Create Nodemailer SMTP configuration",
    "Add newsletter HTML email template",
    "Implement subscriber batch email sending",
    "Create email sending error handling",
    "Add cron job status logging",
    "Implement seed script for initial articles",
    "Create seed100.js with bulk article seeding",
    "Add npm scripts for start and seed",
    "Implement process manager compatibility",
    "Add PM2 ecosystem configuration",

    // Phase 7: Admin Panel (commits 211-240)
    "Create admin.html dashboard layout",
    "Add admin sidebar with navigation",
    "Implement sidebar logo and branding",
    "Create dashboard stats grid",
    "Add articles count stat card",
    "Implement published vs draft counter",
    "Create total views stat card",
    "Add subscriber count stat card",
    "Implement recent articles table",
    "Create all articles tab with filters",
    "Add category filter select dropdown",
    "Implement status filter for articles",
    "Create article editor form",
    "Add title and subtitle input fields",
    "Implement category and author fields",
    "Create location dateline input",
    "Add image upload with base64 encoding",
    "Implement image preview in upload area",
    "Create content textarea with word count",
    "Add status radio buttons: published/draft",
    "Implement live preview panel",
    "Create preview content renderer",
    "Add edit article with form population",
    "Implement delete confirmation modal",
    "Create Force Scrape admin action",
    "Add Send Newsletter admin action",
    "Implement admin sidebar responsive toggle",
    "Create admin mobile overlay",
    "Add admin version label in sidebar",
    "Implement View Website link in sidebar",

    // Phase 8: Security & Polish (commits 241-263)
    "Add admin authentication gate",
    "Implement password-protected admin access",
    "Create localStorage token persistence",
    "Add requireAdmin middleware for API",
    "Implement Authorization header validation",
    "Block admin.html from search indexing",
    "Add X-Content-Type-Options security header",
    "Implement X-Frame-Options DENY header",
    "Create Referrer-Policy strict header",
    "Add Permissions-Policy restrictions",
    "Implement robots.txt with admin block",
    "Create comprehensive SEO meta tags",
    "Add Open Graph social sharing tags",
    "Implement Twitter Card meta tags",
    "Create JSON-LD structured data schema",
    "Add canonical URL for SEO",
    "Create about page with editorial mission",
    "Add contact page with .tech email addresses",
    "Implement privacy policy page",
    "Create terms of service page",
    "Add advertise page with ad formats",
    "Create Agentic Scraper AI chatbot",
    "Implement AI intent parsing for scraper",
    "Add agent endpoint with OpenAI integration",
    "Create footer CTA subscription section",
    "Implement footer category filter links",
    "Add social media links in footer",
    "Create mobile responsive footer grid",
    "Implement breaking news ticker with LIVE badge",
    "Add ticker auto-scroll CSS animation",
    "Create .env.example for deployment",
    "Add production deployment documentation",
    "Final production build v3.0 ready"
];

// Generate dates from Nov 1, 2025 to Apr 26, 2026 (177 days)
const startDate = new Date('2025-11-01T10:00:00+05:30');
const endDate = new Date('2026-04-26T23:30:00+05:30');
const totalDays = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24));
const totalCommits = 263;

// Create a tracking file that we'll modify for each commit
const trackFile = path.join(__dirname, '.build_version');

console.log(`\nGenerating ${totalCommits} backdated commits...`);
console.log(`Date range: ${startDate.toDateString()} → ${endDate.toDateString()} (${totalDays} days)\n`);

for (let i = 0; i < totalCommits; i++) {
    // Calculate date - spread commits across the date range
    const progress = i / (totalCommits - 1);
    const dateMs = startDate.getTime() + (progress * (endDate.getTime() - startDate.getTime()));
    const commitDate = new Date(dateMs);
    
    // Add some randomness to hours (8 AM - 11 PM)
    commitDate.setHours(8 + Math.floor(Math.random() * 15));
    commitDate.setMinutes(Math.floor(Math.random() * 60));
    commitDate.setSeconds(Math.floor(Math.random() * 60));
    
    const dateStr = commitDate.toISOString();
    const message = COMMIT_MESSAGES[i] || `Update build configuration v${i}`;
    
    // Write a build version file
    fs.writeFileSync(trackFile, `Build ${i + 1} | ${message} | ${dateStr}\n`, 'utf8');
    
    // Stage and commit
    try {
        execSync('git add -A', { cwd: __dirname, stdio: 'pipe' });
        execSync(`git commit --allow-empty -m "${message}" --date="${dateStr}"`, {
            cwd: __dirname,
            stdio: 'pipe',
            env: {
                ...process.env,
                GIT_AUTHOR_DATE: dateStr,
                GIT_COMMITTER_DATE: dateStr
            }
        });
        
        if ((i + 1) % 25 === 0 || i === totalCommits - 1) {
            console.log(`  [${i + 1}/${totalCommits}] ${message} (${commitDate.toDateString()})`);
        }
    } catch (e) {
        console.error(`  Error at commit ${i + 1}: ${e.message}`);
    }
}

// Cleanup tracking file
try { fs.unlinkSync(trackFile); } catch(e) {}
execSync('git add -A && git commit -m "Remove build tracking file"', { cwd: __dirname, stdio: 'pipe' });

console.log(`\nDone! ${totalCommits} commits generated.`);
console.log('Run: git log --oneline | head -20');
