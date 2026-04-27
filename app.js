/* ============================================================
   THE TECH REPORTS — Core Application Logic
   Handles articles CRUD, rendering, and navigation
   ============================================================ */

const API_URL = "https://script.google.com/macros/s/AKfycbzT__75BLa7RIlERBfoGtNG6crJhpnYGD0ona2Sfc1PJ5_lNmP8Zp4ul75xoWbJ8M_n/exec"; 

// ---- Data Layer ----
const DEFAULT_CATEGORIES = [
    'Technology', 'World News', 'India', 'Business',
    'Startups', 'Opinion', 'Sports', 'Entertainment'
];

const CATEGORY_CLASSES = {
    'Technology': 'cat-technology',
    'World News': 'cat-world',
    'India': 'cat-india',
    'Business': 'cat-business',
    'Startups': 'cat-startups',
    'Opinion': 'cat-opinion',
    'Sports': 'cat-sports',
    'Entertainment': 'cat-entertainment'
};

// In-memory cache to keep UI synchronous, fetched on load
let _articles = [];

async function loadArticlesFromServer() {
    try {
        const res = await fetch(API_URL + "?action=getArticles");
        if (res.ok) {
            _articles = await res.json();
        }
    } catch (e) {
        console.error("Failed to load articles from server:", e);
    } finally {
        document.dispatchEvent(new Event('ttrDataReady'));
    }
}

function getArticles() {
    return _articles;
}

function saveArticles(articles) {
    // Legacy support, not heavily used now
    _articles = articles;
}

function getArticleById(id) {
    return _articles.find(a => a.id === id) || null;
}

async function createArticle(article) {
    article.id = 'art-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
    article.createdAt = new Date().toISOString();
    article.updatedAt = article.createdAt;
    article.views = 0;
    
    // Optimistic UI update
    _articles.unshift(article);
    
    // Send to backend
    try {
        await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                action: 'createArticle', 
                article: article,
                token: localStorage.getItem('ttr_admin_token') || ''
            })
        });
    } catch (e) {
        console.error("Save failed", e);
    }
    return article;
}

async function updateArticle(id, updates) {
    const idx = _articles.findIndex(a => a.id === id);
    if (idx === -1) return null;
    
    updates.updatedAt = new Date().toISOString();
    _articles[idx] = { ..._articles[idx], ...updates };
    
    // Send to backend
    try {
        await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'updateArticle',
                id: id,
                article: updates,
                token: localStorage.getItem('ttr_admin_token') || ''
            })
        });
    } catch (e) {
        console.error("Update failed", e);
    }
    return _articles[idx];
}

async function deleteArticle(id) {
    _articles = _articles.filter(a => a.id !== id);
    try {
        await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'deleteArticle',
                id: id,
                token: localStorage.getItem('ttr_admin_token') || ''
            })
        });
    } catch (e) {
        console.error("Delete failed", e);
    }
}

function getPublishedArticles() {
    return _articles.filter(a => a.status === 'published');
}

function getArticlesByCategory(category) {
    return getPublishedArticles().filter(a => a.category === category);
}

// Initialize on script load
loadArticlesFromServer();

// ---- Utility Functions ----
function timeAgo(dateStr) {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

    return date.toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric'
    });
}

function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-IN', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
}

function formatDateTime(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function getCategoryClass(category) {
    return CATEGORY_CLASSES[category] || 'cat-technology';
}

function slugify(text) {
    return text.toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
}

function truncate(text, maxLen = 150) {
    if (!text || text.length <= maxLen) return text || '';
    return text.substring(0, maxLen).trim() + '...';
}

function showToast(message, type = 'success') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
        <span>${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'toast-out 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// ---- Image Handling ----
function handleImageUpload(inputElement) {
    return new Promise((resolve) => {
        const file = inputElement.files[0];
        if (!file) return resolve(null);

        // Validate file
        if (!file.type.startsWith('image/')) {
            showToast('Please select a valid image file', 'error');
            return resolve(null);
        }

        if (file.size > 10 * 1024 * 1024) {
            showToast('Image must be less than 10MB', 'error');
            return resolve(null);
        }

        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => {
            showToast('Error reading image file', 'error');
            resolve(null);
        };
        reader.readAsDataURL(file);
    });
}

// ---- Current Date Helper ----
function getCurrentDateString() {
    const now = new Date();
    const options = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
    return now.toLocaleDateString('en-IN', options);
}

// ---- Search Functionality ----
function searchArticles(query) {
    if (!query || query.trim().length < 2) return [];
    const q = query.toLowerCase().trim();
    return getPublishedArticles().filter(a =>
        a.title.toLowerCase().includes(q) ||
        a.subtitle?.toLowerCase().includes(q) ||
        a.content?.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q) ||
        a.author?.toLowerCase().includes(q)
    );
}

// Export for use in HTML pages
window.TTR = {
    loadArticlesFromServer,
    getArticles,
    saveArticles,
    getArticleById,
    createArticle,
    updateArticle,
    deleteArticle,
    getPublishedArticles,
    getArticlesByCategory,
    searchArticles,
    timeAgo,
    formatDate,
    formatDateTime,
    getCategoryClass,
    slugify,
    truncate,
    showToast,
    handleImageUpload,
    getCurrentDateString,
    DEFAULT_CATEGORIES,
    CATEGORY_CLASSES
};
