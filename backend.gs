// ============================================================================
// THE TECH REPORTS — AUTOMATED AI BACKEND (Google Apps Script)
// ============================================================================

// --- Config Keys ---
const NEWSAPI_KEY = "7b1dbe422b9e4f2daf4722e178db1b66";
const OPENAI_KEY = "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";
const ADMIN_TOKEN = "iwillbemorerichthanelonmusk";

// Gets the ID from Script Properties (or null if not set yet)
function getSpreadsheetId() {
  let id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (!id) {
    try {
      id = SpreadsheetApp.getActiveSpreadsheet().getId();
    } catch(e) {
      id = null;
    }
  }
  return id;
}

// ============================================================================
// 1. INITIALIZATION (Run this once manually in the Apps Script Editor)
// ============================================================================
function setupSheets() {
  let id = getSpreadsheetId();
  let ss;
  
  if (!id) {
    // Automatically create a new Google Sheet in the user's Drive
    ss = SpreadsheetApp.create("The Tech Reports DB");
    id = ss.getId();
    PropertiesService.getScriptProperties().setProperty("SPREADSHEET_ID", id);
    Logger.log("Created NEW Spreadsheet! You can view it here: " + ss.getUrl());
  } else {
    ss = SpreadsheetApp.openById(id);
    Logger.log("Using existing Spreadsheet: " + ss.getUrl());
  }
  
  let articlesSheet = ss.getSheetByName("Articles");
  if (!articlesSheet) {
    articlesSheet = ss.insertSheet("Articles");
    articlesSheet.appendRow(["ID", "Title", "Subtitle", "Content", "Category", "Author", "Location", "Image", "Status", "Featured", "CreatedAt", "UpdatedAt", "Views", "SourceUrl", "SourcePublisher"]);
    articlesSheet.getRange("A1:O1").setFontWeight("bold").setBackground("#0f1923").setFontColor("#ffffff");
    articlesSheet.setFrozenRows(1);
  }
  
  let subSheet = ss.getSheetByName("Subscribers");
  if (!subSheet) {
    subSheet = ss.insertSheet("Subscribers");
    subSheet.appendRow(["Email", "SubscribedAt", "Status"]);
    subSheet.getRange("A1:C1").setFontWeight("bold").setBackground("#0f1923").setFontColor("#ffffff");
    subSheet.setFrozenRows(1);
  }
  
  Logger.log("Sheets successfully setup!");
}

// ============================================================================
// 2. WEB API ENDPOINTS
// ============================================================================

function doPost(e) {
  return handleCORS(handleRequest(e, "POST"));
}

function doGet(e) {
  return handleCORS(handleRequest(e, "GET"));
}

function doOptions(e) {
  return handleCORS(ContentService.createTextOutput(""));
}

function handleCORS(response) {
  // Apps Script automatically handles CORS for external fetches when published to "Anyone"
  // but we can add headers if returning HTML. For JSON, ContentService is sufficient.
  return response;
}

function handleRequest(e, method) {
  try {
    let payload = {};
    if (method === "POST" && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else {
      payload = e.parameter || {};
    }

    const action = payload.action || (e.parameter ? e.parameter.action : null);
    
    // Public routes
    if (action === "getArticles") return sendJSON(getArticlesFromSheet());
    if (action === "subscribe") return sendJSON(addSubscriber(payload.email));

    // Admin protected routes
    const token = payload.token || (e.parameter ? e.parameter.token : null);
    if (!token || token !== ADMIN_TOKEN) {
      throw new Error("Unauthorized");
    }

    if (action === "createArticle") return sendJSON(createArticle(payload.article));
    if (action === "updateArticle") return sendJSON(updateArticle(payload.id, payload.article));
    if (action === "deleteArticle") return sendJSON(deleteArticle(payload.id));
    if (action === "triggerScrape") return sendJSON(manualScrape());
    if (action === "triggerEmail") return sendJSON(sendDailyNewsletter());
    if (action === "agent") return sendJSON(runAgentScraper(payload.prompt));

    return sendJSON({ error: "Unknown action: " + action });

  } catch (err) {
    return sendJSON({ error: err.message });
  }
}

function sendJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================================
// 3. IMAGE UPLOAD HANDLING
// ============================================================================
function processImage(imageData) {
  if (!imageData) return "";
  if (imageData.startsWith("http")) return imageData; // Already a URL
  
  if (imageData.startsWith("data:image")) {
    try {
      const folderName = "TTR_Images";
      let folders = DriveApp.getFoldersByName(folderName);
      let folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
      folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      
      const parts = imageData.split(',');
      const contentType = parts[0].split(':')[1].split(';')[0];
      const blob = Utilities.newBlob(Utilities.base64Decode(parts[1]), contentType, "img-" + Date.now());
      const file = folder.createFile(blob);
      
      // Return a public viewing URL
      return "https://drive.google.com/uc?export=view&id=" + file.getId();
    } catch(e) {
      Logger.log("Image upload error: " + e.message);
      return "";
    }
  }
  return imageData;
}

// ============================================================================
// 4. DATABASE OPERATIONS (CRUD)
// ============================================================================

function getArticlesFromSheet() {
  const id = getSpreadsheetId();
  if (!id) return [];
  const sheet = SpreadsheetApp.openById(id).getSheetByName("Articles");
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return []; 
  
  const headers = data[0];
  const articles = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    let obj = {};
    for (let j = 0; j < headers.length; j++) {
      let key = headers[j];
      let val = row[j];
      // Convert boolean strings
      if (val === "TRUE" || val === true) val = true;
      if (val === "FALSE" || val === false) val = false;
      let propName = key === "ID" ? "id" : key.charAt(0).toLowerCase() + key.slice(1);
      obj[propName] = val; // camelCase
    }
    articles.push(obj);
  }
  return articles.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function createArticle(data) {
  const id = getSpreadsheetId();
  if (!id) throw new Error("Database not setup");
  const sheet = SpreadsheetApp.openById(id).getSheetByName("Articles");
  const imgUrl = processImage(data.image);
  const now = new Date().toISOString();
  
  sheet.insertRowAfter(1);
  sheet.getRange(2, 1, 1, 15).setValues([[
    data.id || "art-" + Date.now(),
    data.title,
    data.subtitle,
    data.content,
    data.category || "Technology",
    data.author || "TTR Staff",
    data.location || "Global",
    imgUrl,
    data.status || "published",
    data.featured ? true : false,
    data.createdAt || now,
    now,
    data.views || 0,
    data.sourceUrl || "",
    data.sourcePublisher || ""
  ]]);
  return { success: true };
}

function updateArticle(artId, data) {
  const id = getSpreadsheetId();
  if (!id) throw new Error("Database not setup");
  const sheet = SpreadsheetApp.openById(id).getSheetByName("Articles");
  const rows = sheet.getDataRange().getValues();
  
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === artId) { // Col A is ID
      const imgUrl = processImage(data.image);
      const now = new Date().toISOString();
      
      sheet.getRange(i + 1, 2, 1, 11).setValues([[
        data.title, data.subtitle, data.content, data.category, data.author, data.location,
        imgUrl, data.status, data.featured ? true : false, rows[i][10], now
      ]]);
      return { success: true };
    }
  }
  throw new Error("Article not found");
}

function deleteArticle(artId) {
  const id = getSpreadsheetId();
  if (!id) throw new Error("Database not setup");
  const sheet = SpreadsheetApp.openById(id).getSheetByName("Articles");
  const rows = sheet.getDataRange().getValues();
  
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === artId) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  throw new Error("Article not found");
}

function addSubscriber(email) {
  if (!email || !email.includes("@")) throw new Error("Invalid email");
  const id = getSpreadsheetId();
  if (!id) throw new Error("Database not setup");
  const sheet = SpreadsheetApp.openById(id).getSheetByName("Subscribers");
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === email) return { success: true, message: "Already subscribed" };
  }
  sheet.appendRow([email, new Date().toISOString(), "active"]);
  return { success: true };
}

// ============================================================================
// 5. AGENTIC SCRAPER & OPENAI INTEGRATION
// ============================================================================

function manualScrape() {
  const queries = ["technology breakthrough", "startup funding", "artificial intelligence"];
  const query = queries[Math.floor(Math.random() * queries.length)];
  const result = runAgentScraper(query);
  return { success: true, message: `Scraped ${result.count} articles for: ${query}` };
}

function runAgentScraper(prompt) {
  // 1. Ask OpenAI to extract intent
  const intentPrompt = "You are a news topic extraction agent. The user will give you a command to scrape news. Return ONLY a JSON object with two fields: 'query' (the exact search phrase for NewsAPI) and 'category' (Technology, World News, India, Business, Startups, Opinion, Sports, Entertainment). Example: {\"query\": \"Elon Musk\", \"category\": \"Technology\"}";
  
  const intentBody = {
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: intentPrompt },
      { role: "user", content: prompt }
    ]
  };
  
  const intentRes = UrlFetchApp.fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": "Bearer " + OPENAI_KEY, "Content-Type": "application/json" },
    payload: JSON.stringify(intentBody),
    muteHttpExceptions: true
  });
  
  let intent;
  try {
    const parsed = JSON.parse(intentRes.getContentText());
    let txt = parsed.choices[0].message.content.replace(/```json/gi, '').replace(/```/g, '').trim();
    intent = JSON.parse(txt);
  } catch(e) {
    intent = { query: prompt, category: "Technology" };
  }
  
  // 2. Fetch from NewsAPI
  const newsUrl = `https://newsapi.org/v2/everything?q=${encodeURIComponent(intent.query)}&sortBy=popularity&pageSize=5&language=en&apiKey=${NEWSAPI_KEY}`;
  const newsRes = UrlFetchApp.fetch(newsUrl, { muteHttpExceptions: true });
  
  if (newsRes.getResponseCode() !== 200) throw new Error("NewsAPI failed");
  
  const articlesRaw = JSON.parse(newsRes.getContentText()).articles || [];
  let count = 0;
  
  // 3. Rewrite and Save
  for (let i = 0; i < articlesRaw.length; i++) {
    const raw = articlesRaw[i];
    if (!raw.title || raw.title === "[Removed]") continue;
    
    const rewritePrompt = `Rewrite this news article. Return ONLY a JSON object (no markdown):
{"title": "Professional headline", "subtitle": "One sentence summary", "content": "3 paragraphs of text with \\n\\n", "author": "TTR AI Desk", "location": "City/Global"}
Original Title: ${raw.title}
Original Desc: ${raw.description || ''}`;

    const rwRes = UrlFetchApp.fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + OPENAI_KEY, "Content-Type": "application/json" },
      payload: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: rewritePrompt }],
        temperature: 0.7
      }),
      muteHttpExceptions: true
    });
    
    if (rwRes.getResponseCode() === 200) {
      try {
        let rwTxt = JSON.parse(rwRes.getContentText()).choices[0].message.content.replace(/```json/gi, '').replace(/```/g, '').trim();
        let rw = JSON.parse(rwTxt);
        
        createArticle({
          title: rw.title, subtitle: rw.subtitle, content: rw.content, category: intent.category,
          author: rw.author, location: rw.location, image: raw.urlToImage,
          status: "published", featured: false, sourceUrl: raw.url, sourcePublisher: raw.source.name
        });
        count++;
      } catch(e) { }
    }
  }
  return { success: true, count: count, topic: intent.query };
}

// ============================================================================
// 6. NEWSLETTER
// ============================================================================
function sendDailyNewsletter() {
  const id = getSpreadsheetId();
  if (!id) return { success: false, error: "Database not setup" };
  const articlesSheet = SpreadsheetApp.openById(id).getSheetByName("Articles");
  const subSheet = SpreadsheetApp.openById(id).getSheetByName("Subscribers");
  if (!articlesSheet || !subSheet) return { success: false, error: "Sheets missing" };
  
  const subsData = subSheet.getDataRange().getValues();
  const emails = [];
  for (let i = 1; i < subsData.length; i++) if (subsData[i][2] === "active") emails.push(subsData[i][0]);
  if (emails.length === 0) return { success: true, message: "No subscribers" };
  
  const articles = getArticlesFromSheet().slice(0, 3);
  if (articles.length === 0) return { success: true, message: "No articles" };
  
  let htmlBody = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
    <h1 style="background:#0f1923;color:#fff;padding:20px;text-align:center;">The Tech Reports</h1>
    <div style="padding:20px;">`;
  
  articles.forEach(a => {
    htmlBody += `
      <div style="margin-bottom:20px;">
        <h2 style="margin:0;"><a href="https://gamedia-09.web.app/" style="color:#b71c1c;text-decoration:none;">${a.title}</a></h2>
        <p style="color:#666;">${a.subtitle}</p>
      </div><hr>`;
  });
  
  htmlBody += `</div><p style="text-align:center;font-size:12px;color:#999;">&copy; The Tech Reports</p></div>`;
  
  for (let i = 0; i < emails.length; i += 50) {
    MailApp.sendEmail({
      to: "noreply@thetechreports.tech",
      bcc: emails.slice(i, i + 50).join(","),
      subject: "The Tech Reports Daily: " + articles[0].title,
      htmlBody: htmlBody
    });
  }
  return { success: true, sentTo: emails.length };
}
