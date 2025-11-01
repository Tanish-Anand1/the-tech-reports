// ============================================================================
// THE TECH REPORTS — AUTOMATED AI BACKEND (Google Apps Script)
// ============================================================================

// --- Config Keys ---
const GROK_API_KEY = "sk-hc-v1-28bcd4d0b97d4f9ca2fbcf98bf13926614ec8d2c77f1476387eb9cb83a9bfdc3";
const SEARCH_API_KEY = "sk-hcs-v1-94523666e78b433fbe070e92ac279c592510a70ffed546e8bc0068181a5fbc05";

// Spreadsheet setup: 
// 1. You must be bound to a Google Sheet OR provide SPREADSHEET_ID below.
// 2. Create a tab named "Articles"
//    Columns: ID | Title | Subtitle | Content | Category | Author | Location | Image | Status | Featured | CreatedAt | UpdatedAt | Views
// 3. Create a tab named "Subscribers"
//    Columns: Email | SubscribedAt | Status
const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId(); // Change this if using a standalone script

// ============================================================================
// 1. WEB API ENDPOINTS (For app.js & index.html to communicate with)
// ============================================================================

function doPost(e) {
  return handleRequest(e, "POST");
}

function doGet(e) {
  return handleRequest(e, "GET");
}

function handleRequest(e, method) {
  try {
    let responseData = {};
    
    // For POST requests, parse the payload. For GET, use parameter map.
    let payload = {};
    if (method === "POST" && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else {
      payload = e.parameter || {};
    }

    const action = payload.action || (e.parameter ? e.parameter.action : null);

    if (action === "getArticles") {
      responseData = getArticlesFromSheet();
    } else if (action === "subscribe") {
      responseData = addSubscriber(payload.email);
    } else if (action === "triggerScrape") {
      // Manual trigger from admin panel
      fetchAndGenerateNews();
      responseData = { success: true, message: "AI News Generation started." };
    } else if (action === "triggerEmail") {
      sendDailyNewsletter();
      responseData = { success: true, message: "Newsletter sent!" };
    } else {
      responseData = { error: "Unknown action: " + action };
    }

    return ContentService.createTextOutput(JSON.stringify(responseData))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// CORS Note: Apps Script automatically handles CORS for doGet/doPost if deployed to "Anyone".

// ============================================================================
// 2. DATABASE OPERATIONS (Google Sheets)
// ============================================================================

function getArticlesFromSheet() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Articles");
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return []; // Empty or just headers
  
  const headers = data[0];
  const articles = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    let obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = row[j];
    }
    articles.push(obj);
  }
  
  // Sort by CreatedAt descending
  return articles.sort((a, b) => new Date(b.CreatedAt) - new Date(a.CreatedAt));
}

function addSubscriber(email) {
  if (!email || !email.includes("@")) throw new Error("Invalid email");
  
  let sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Subscribers");
  if (!sheet) {
    // Create sheet if missing
    sheet = SpreadsheetApp.openById(SPREADSHEET_ID).insertSheet("Subscribers");
    sheet.appendRow(["Email", "SubscribedAt", "Status"]);
  }
  
  // Check if exists
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === email) return { success: true, message: "Already subscribed." };
  }
  
  sheet.appendRow([email, new Date().toISOString(), "active"]);
  return { success: true, message: "Successfully subscribed!" };
}

function writeArticlesToSheet(articlesArray) {
  let sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Articles");
  if (!sheet) {
    sheet = SpreadsheetApp.openById(SPREADSHEET_ID).insertSheet("Articles");
    sheet.appendRow(["ID", "Title", "Subtitle", "Content", "Category", "Author", "Location", "Image", "Status", "Featured", "CreatedAt", "UpdatedAt", "Views"]);
  }
  
  articlesArray.forEach(a => {
    // Basic defaults
    const id = "art-" + Date.now() + "-" + Math.floor(Math.random()*10000);
    const dateStr = new Date().toISOString();
    
    sheet.insertRowAfter(1); // Add to top
    sheet.getRange(2, 1, 1, 13).setValues([[
      a.id || id,
      a.title,
      a.subtitle,
      a.content,
      a.category || "Technology",
      a.author || "TTR AI Desk",
      a.location || "Global",
      a.image || "",    
      a.status || "published",
      a.featured || false,
      a.createdAt || dateStr,
      a.updatedAt || dateStr,
      0 // initial views
    ]]);
  });
}

// ============================================================================
// 3. AI SCRAPING & GENERATION (Run this via daily Time-Driven trigger)
// ============================================================================

function fetchAndGenerateNews() {
  Logger.log("Starting AI News Generation...");
  
  // 1. Formulate search queries for trending tech
  const queries = [
    "latest artificial intelligence news startups funding",
    "breaking tech news silicon valley india",
    "new tech gadgets internet developments this week"
  ];
  
  const rawFacts = [];
  
  // 2. Scrape HackClub Search API
  queries.forEach(q => {
    const url = "https://search.hackclub.com/res/v1/web/search?q=" + encodeURIComponent(q);
    const options = {
      method: "GET",
      headers: { "Authorization": "Bearer " + SEARCH_API_KEY },
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() === 200) {
      const data = JSON.parse(response.getContentText());
      if (data.results && data.results.length > 0) {
         // Grab top 3 results from each query
         data.results.slice(0, 3).forEach(res => {
            rawFacts.push({
               title: res.title,
               snippet: res.snippet,
               url: res.url
            });
         });
      }
    }
  });
  
  if (rawFacts.length === 0) {
    Logger.log("No facts gathered. Exiting.");
    return;
  }
  
  // 3. Use Grok API to write high-quality tech articles
  // We process them in batches or individually so Grok doesn't get overwhelmed.
  // We'll instruct Grok to return 3 distinct, beautifully formatted articles based on facts.
  
  const prompt = `You are an elite technology journalist for "The Tech Reports". 
Take the following raw facts/search results and write 3 distinct, highly professional, exciting news articles.
Do not invent facts, simply expand upon the provided context in a journalistic tone.
Each article must have:
- title: A sexy, compelling headline (no clickbait, but professional and viral).
- subtitle: A strong one-sentence summary.
- content: 3-4 paragraphs of beautifully written prose summarizing the issue. (Format paragraphs with \n\n).
- category: Pick one: "Technology", "Startups", "Business", "World News", "India".
- location: A realistic origin city (e.g., "San Francisco", "Bengaluru", "Global").

Raw Facts:
${JSON.stringify(rawFacts)}

Return ONLY a valid JSON array of article objects matching the specified schema. No markdown wrapping.`;

  const requestBody = {
    model: "x-ai/grok-4.1-fast",
    messages: [
      { role: "system", content: "You output pure JSON arrays." },
      { role: "user", content: prompt }
    ]
  };

  const grokOptions = {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + GROK_API_KEY,
      "Content-Type": "application/json"
    },
    payload: JSON.stringify(requestBody),
    muteHttpExceptions: true
  };

  const grokResponse = UrlFetchApp.fetch("https://ai.hackclub.com/proxy/v1/chat/completions", grokOptions);
  
  if (grokResponse.getResponseCode() === 200) {
    try {
      const resultObj = JSON.parse(grokResponse.getContentText());
      let reply = resultObj.messages ? resultObj.messages[0].content : resultObj.choices[0].message.content; // HackClub wrapper sometimes differs
      reply = reply.replace(/```json/g, '').replace(/```/g, '').trim();
      
      const newArticles = JSON.parse(reply);
      writeArticlesToSheet(newArticles);
      Logger.log("Successfully inserted " + newArticles.length + " new articles.");
      
    } catch (e) {
      Logger.log("Error parsing Grok JSON: " + e.message);
      Logger.log(grokResponse.getContentText());
    }
  } else {
    Logger.log("Grok API Error: " + grokResponse.getContentText());
  }
}

// ============================================================================
// 4. AUTOMATED DAILY EMAIL (Run via daily Time-Driven trigger)
// ============================================================================

function sendDailyNewsletter() {
  const articlesSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Articles");
  const subSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Subscribers");
  
  if (!articlesSheet || !subSheet) return;
  
  // Get active subscribers
  const subsData = subSheet.getDataRange().getValues();
  const emails = [];
  for (let i = 1; i < subsData.length; i++) {
    if (subsData[i][2] === "active") {
      emails.push(subsData[i][0]);
    }
  }
  
  if (emails.length === 0) return;
  
  // Get top 3 latest articles
  const allArticles = getArticlesFromSheet();
  const latest = allArticles.slice(0, 3);
  if (latest.length === 0) return;
  
  const todayStr = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  
  // Construct a super professional HTML layout
  let htmlBody = \`
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; color: #1a1a1a;">
      <div style="text-align: center; padding: 30px 20px; background: #0f1923; color: white;">
        <h1 style="margin: 0; font-size: 28px; line-height: 1;">The Tech <em>Reports</em></h1>
        <p style="margin: 5px 0 0; font-size: 14px; opacity: 0.8; letter-spacing: 1px;">DAILY BRIEFING &bull; \${todayStr}</p>
      </div>
      <div style="padding: 30px;">
        <p style="font-size: 16px; line-height: 1.6;">Here are the top technology, startup, and business stories shaping the world today.</p>
        <hr style="border: 0; border-top: 1px solid #e0e0e0; margin: 25px 0;">
  \`;
  
  latest.forEach((article, index) => {
    htmlBody += \`
      <div style="margin-bottom: 30px;">
        <div style="font-size: 12px; font-weight: 800; color: #cc2936; text-transform: uppercase; margin-bottom: 5px;">\${article.Category}</div>
        <h2 style="margin: 0 0 10px; font-size: 22px; line-height: 1.3;"><a href="#" style="color: #1a1a1a; text-decoration: none;">\${article.Title}</a></h2>
        <p style="margin: 0; font-size: 15px; color: #666; line-height: 1.5;">\${article.Subtitle || article.Content.substring(0, 120) + "..."}</p>
      </div>
    \`;
  });
  
  htmlBody += \`
      </div>
      <div style="text-align: center; padding: 20px; background: #f5f5f5; font-size: 12px; color: #888;">
        <p>You received this because you are subscribed to The Tech Reports Daily Briefing.</p>
        <p>&copy; \${new Date().getFullYear()} The Tech Reports. All rights reserved.</p>
      </div>
    </div>
  \`;

  // Send BCC to all subscribers
  // Limit BCC to 50 at a time to comply with Gmail limits
  for (let i = 0; i < emails.length; i += 50) {
    const batch = emails.slice(i, i + 50);
    MailApp.sendEmail({
      to: "noreply@thetechreports.com",
      bcc: batch.join(","),
      subject: "The Tech Reports Daily: " + latest[0].Title.substring(0, 50) + "...",
      htmlBody: htmlBody
    });
  }
}
