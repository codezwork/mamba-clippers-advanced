// --- CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyDqI6yHiHJ7Ao257KmVaTSOPJ7C3hd9V7U",
    authDomain: "mambaclippers.firebaseapp.com",
    projectId: "mambaclippers",
    storageBucket: "mambaclippers.firebasestorage.app",
    messagingSenderId: "400915321062",
    appId: "1:400915321062:web:8a8ee616725d40ea47eb27"
};

const BACKEND_URL = "https://mamba-clippers-backend-views-scrapper.onrender.com/refresh-stats";

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const auth = firebase.auth(); 

auth.onAuthStateChanged((user) => {
    const splash = document.getElementById('splash-view');
    const loginView = document.getElementById('login-view');
    const homeView = document.getElementById('home-view');

    const loginTime = localStorage.getItem('mambaLoginTime');
    const oneDayMs = 24 * 60 * 60 * 1000; 
    const now = Date.now();

    if (user && (!loginTime || (now - loginTime > oneDayMs))) {
        console.log("Session expired. Forcing logout.");
        auth.signOut(); 
        return;
    }

    if (user) {
        loginView.classList.add('hidden');
        loginView.classList.remove('active');
        
        if (document.getElementById('dashboard-view').classList.contains('hidden') && 
            document.getElementById('profile-select-view').classList.contains('hidden')) {
            homeView.classList.remove('hidden');
        }
        
        loadGlobalSettings(); 
        // PREMIUM FADE OUT
        setTimeout(() => { 
            splash.style.opacity = '0';
            setTimeout(() => { 
                splash.classList.add('hidden');
                splash.style.opacity = '1';
            }, 800); 
        }, 1200);

    } else {
        hideAllViews();
        loginView.classList.remove('hidden');
        loginView.classList.add('active');
        splash.classList.add('hidden');
        localStorage.removeItem('mambaLoginTime'); 
    }
});

function hideAllViews() {
    document.getElementById('home-view').classList.add('hidden');
    document.getElementById('profile-select-view').classList.add('hidden');
    document.getElementById('dashboard-view').classList.add('hidden');
}

async function handleMasterLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorText = document.getElementById('login-error');
    const btn = document.querySelector('#login-view button');

    if (!email || !password) {
        errorText.innerText = "Please enter credentials.";
        errorText.style.display = 'block';
        return;
    }

    const originalText = btn.innerText;
    btn.innerText = "VERIFYING...";
    btn.disabled = true;
    errorText.style.display = 'none';

    localStorage.setItem('mambaLoginTime', Date.now()); 

    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        console.error("Login Failed", error);
        localStorage.removeItem('mambaLoginTime'); 
        btn.innerText = originalText;
        btn.disabled = false;
        errorText.innerText = "Access Denied: Invalid Credentials";
        errorText.style.display = 'block';
    }
}

function handleLogout() {
    if(confirm("Disconnect from Mamba System?")) {
        auth.signOut().then(() => {
            showToast("Logged out successfully", "info");
        });
    }
}

let appData = [];
let currentUser = "";
let currentPlatform = "TikTok"; 
let currentProfileKey = null; 
let currentProfileName = "";

let isLoading = false;
let profileConfig = {};
let cpmConfig = {}; // NEW: Parallel state for Custom CPMs
let passwordsData = {};
let unsubscribeVideos = null;
let currentEditingId = null;
let currentSortOrder = "newest"; 
let betaRevenue = 0; // NEW: Isolated Beta Revenue variable

let isSelectionMode = false;
let selectedVideoIds = new Set();
let longPressTimer = null;
const LONG_PRESS_DURATION = 500;

let debounceTimer;
function debounce(func, delay) {
    return function(...args) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => func.apply(this, args), delay);
    };
}

function showToast(message, type = 'info') {
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.innerHTML = `
        <div class="toast-icon">${type === 'error' ? '⚠️' : type === 'success' ? '✓' : 'ℹ️'}</div>
        <div class="toast-message">${message}</div>
        <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
    `;
    document.body.appendChild(toast);
    setTimeout(() => { if (toast.parentElement) toast.remove(); }, 3000);
}

document.addEventListener('DOMContentLoaded', () => {
    const toastStyles = document.createElement('style');
    toastStyles.textContent = `
        .toast-notification {
            position: fixed; top: 20px; right: 20px; background: #1a1a1a;
            border-left: 4px solid #ff4444; border-radius: 4px; padding: 12px 16px;
            color: white; display: flex; align-items: center; gap: 12px;
            z-index: 9999; box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            animation: slideIn 0.3s ease; max-width: 320px;
        }
        .toast-success { border-color: #2ecc71; }
        .toast-error { border-color: #ff4444; }
        .toast-info { border-color: #3498db; }
        .toast-icon { font-size: 18px; }
        .toast-message { flex: 1; font-size: 14px; }
        .toast-close { background: none; border: none; color: #666; font-size: 20px; cursor: pointer; padding: 0; line-height: 1; }
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    `;
    document.head.appendChild(toastStyles);

    document.addEventListener('click', function(event) {
        if (!event.target.closest('.dropdown-container')) {
            document.querySelectorAll('.dropdown-menu').forEach(menu => menu.classList.add('hidden'));
        }
    });
});

async function loadGlobalSettings() {
    try {
        const settingsDoc = await db.collection('settings').doc('global').get();
        if (settingsDoc.exists) {
            const data = settingsDoc.data();
            profileConfig = data.profileConfig || {};
            cpmConfig = data.betaCpmConfig || {}; // Load isolated CPM dict
            
            // New Beta Legacy Logic
            betaRevenue = data.betaRevenue || 0;
            let targetDateMs = data.betaTargetDate;
            
            // If the target date was never set (first load of beta), set it to 48 days from now
            if (!targetDateMs) {
                targetDateMs = Date.now() + (48 * 24 * 60 * 60 * 1000);
                db.collection('settings').doc('global').update({ betaTargetDate: targetDateMs });
            }
            
            const daysLeft = Math.max(0, Math.ceil((targetDateMs - Date.now()) / (1000 * 60 * 60 * 24)));
            
            document.getElementById('beta-revenue-amount').innerText = betaRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            document.getElementById('beta-days-left').innerText = daysLeft;
        }
        const passwordsSnapshot = await db.collection('passwords log').get();
        passwordsData = {};
        passwordsSnapshot.forEach(doc => { passwordsData[doc.id] = doc.data(); });
        return true;
    } catch (error) {
        console.error("Error loading settings:", error);
        return false;
    }
}

function toggleLegacyModal(show) {
    const modal = document.getElementById('legacy-modal');
    if (show) {
        document.getElementById('legacy-input').value = betaRevenue;
        modal.classList.remove('hidden');
    } else {
        modal.classList.add('hidden');
    }
}

function openLegacyModal() {
    toggleLegacyModal(true);
}

async function updateLegacyRevenue() {
    const val = parseFloat(document.getElementById('legacy-input').value);
    if (isNaN(val)) {
        showToast('Invalid Amount', 'error');
        return;
    }
    
    toggleLegacyModal(false);
    showLoading(true);
    
    try {
        await db.collection('settings').doc('global').update({
            betaRevenue: val
        });
        betaRevenue = val;
        document.getElementById('beta-revenue-amount').innerText = betaRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        showToast('Revenue Updated', 'success');
    } catch (e) {
        console.error(e);
        showToast('Update Failed', 'error');
    }
    showLoading(false);
}

// Helper to fetch the custom CPM
// Helper to fetch the custom CPM
// Helper to fetch the custom CPM
function getProfileCpm(user, platform, profileKey) {
    if (!profileKey) return 1.50;
    
    // BULLETPROOF FIX: Force lowercase and strip ALL spaces 
    // This handles "Profile 1", "Profile1", "profile 1", etc., and turns them all into "profile1"
    let dbKey = String(profileKey).toLowerCase().replace(/\s+/g, '');

    // Check if the custom CPM exists using the normalized dbKey
    if (cpmConfig[user] && cpmConfig[user][platform] && cpmConfig[user][platform][dbKey] !== undefined) {
        return parseFloat(cpmConfig[user][platform][dbKey]);
    }
    
    return 1.50; // Default CPM if none set
}

async function openProfileSelection(user, platform) {
    showLoading(true);
    if (Object.keys(profileConfig).length === 0) {
        await loadGlobalSettings();
    }

    currentUser = user;
    currentPlatform = platform;

    document.getElementById('home-view').classList.add('hidden');
    document.getElementById('dashboard-view').classList.add('hidden');
    
    const psView = document.getElementById('profile-select-view');
    psView.classList.remove('hidden');
    psView.classList.add('active');

    document.getElementById('ps-header-user').innerText = user.toUpperCase();
    document.getElementById('ps-platform-icon').innerHTML = getPlatformLogo(platform);

    renderProfileSelectionList();
    fetchPlatformStats(); 
    showLoading(false);
}

function togglePlatform() {
    if (!currentUser) return;
    const newPlatform = currentPlatform === 'TikTok' ? 'Instagram' : 'TikTok';
    const iconDiv = document.getElementById('ps-platform-icon');
    iconDiv.style.transform = 'scale(0.8)';
    setTimeout(() => {
        iconDiv.style.transform = 'scale(1)';
        openProfileSelection(currentUser, newPlatform);
    }, 150);
}

async function fetchPlatformStats() {
    document.getElementById('platform-total-revenue').innerText = "Loading...";
    try {
        const snapshot = await db.collection('videos')
            .where('person', '==', currentUser)
            .where('platform', '==', currentPlatform)
            .get();
        
        let totalRevenue = 0;
        snapshot.forEach(doc => {
            const data = doc.data();
            const views = data.views ? parseInt(data.views) : 0;
            const currentCpm = getProfileCpm(data.person, data.platform, data.profile);
            totalRevenue += (views / 1000) * currentCpm;
        });
        
        document.getElementById('platform-total-revenue').innerText = 
            `$${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            
    } catch (e) {
        console.error(e);
        document.getElementById('platform-total-revenue').innerText = "---";
    }
}

function openProfileFeed(profileKey, profileName) {
    currentProfileKey = profileKey;
    currentProfileName = profileName;

    document.getElementById('profile-select-view').classList.add('hidden');
    document.getElementById('dashboard-view').classList.remove('hidden');
    document.getElementById('dashboard-view').classList.add('active');

    document.getElementById('current-profile-name').innerText = profileName.toUpperCase();
    
    fetchVideosForProfile();
}

function goHome() {
    exitSelectionMode();
    document.getElementById('profile-select-view').classList.add('hidden');
    document.getElementById('dashboard-view').classList.add('hidden');
    document.getElementById('home-view').classList.remove('hidden');
    
    appData = [];
    if (unsubscribeVideos) {
        unsubscribeVideos();
        unsubscribeVideos = null;
    }
}

function goToProfileSelect() {
    exitSelectionMode();
    document.getElementById('dashboard-view').classList.add('hidden');
    openProfileSelection(currentUser, currentPlatform);
    
    if (unsubscribeVideos) {
        unsubscribeVideos();
        unsubscribeVideos = null;
    }
}

function getProfileData() {
    let config = {};
    if (profileConfig[currentUser] && profileConfig[currentUser][currentPlatform]) {
        config = profileConfig[currentUser][currentPlatform];
    }
    const profileKeys = Object.keys(config).filter(k => k.startsWith('profile'));
    
    const sortedKeys = profileKeys.sort((a, b) => {
        const numA = parseInt(a.replace('profile', '')) || 0;
        const numB = parseInt(b.replace('profile', '')) || 0;
        return numA - numB;
    });

    if (sortedKeys.length === 0) {
        return [
            { key: "Profile 1", dbKey: "profile1", name: "Main Profile (Default)" }
        ];
    }

    return sortedKeys.map(k => {
        const num = k.replace('profile', '');
        return {
            key: `Profile ${num}`, 
            dbKey: k, 
            name: config[k]
        };
    });
}

function renderProfileSelectionList() {
    const container = document.getElementById('profile-list-grid');
    container.innerHTML = '';
    
    const profiles = getProfileData();

    profiles.forEach(p => {
        const card = document.createElement('div');
        card.className = 'profile-select-card';
        card.onclick = () => openProfileFeed(p.key, p.name);
        
        card.innerHTML = `
            <div>
                <h3 style="color: #fff; font-size: 16px;">${p.name}</h3>
                <span style="color: #666; font-size: 12px;">${currentUser} • ${currentPlatform}</span>
            </div>
            <div style="color: #ff4444;">&#8594;</div>
        `;
        container.appendChild(card);
    });
}

async function fetchVideosForProfile() {
    showLoading(true);
    if (unsubscribeVideos) unsubscribeVideos();

    try {
        unsubscribeVideos = db.collection('videos')
            .where('person', '==', currentUser)
            .where('platform', '==', currentPlatform)
            .where('profile', '==', currentProfileKey)
            .onSnapshot((snapshot) => {
                appData = [];
                snapshot.forEach((doc) => {
                    appData.push({ ...doc.data(), id: doc.id });
                });
                renderDashboard(); 
                updateHeaderStats();
                showLoading(false);
            }, (error) => {
                console.error("Firestore Error:", error);
                if (error.code === 'failed-precondition') {
                    showToast("Index required! Check Console.", "error");
                } else {
                    showToast('Error syncing data.', 'error');
                }
                showLoading(false);
            });

    } catch (error) {
        showToast('Error loading data.', 'error');
        console.error(error);
        showLoading(false);
    }
}

function updateHeaderStats() {
    let totalRevenue = 0;
    let totalVideos = appData.length;
    let approvedCount = 0;
    let rejectedCount = 0;
    let pendingCount = 0;
    
    appData.forEach(v => {
        const views = v.views ? parseInt(v.views) : 0;
        const currentCpm = getProfileCpm(v.person, v.platform, v.profile);
        totalRevenue += (views / 1000) * currentCpm;
        
        if (v.status === 'Approved') approvedCount++;
        else if (v.status === 'Rejected') rejectedCount++;
        else pendingCount++;
    });

    document.getElementById('stat-revenue').innerText = `$${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    document.getElementById('stat-total-clips').innerText = totalVideos.toString();

    const pApproved = totalVideos > 0 ? (approvedCount / totalVideos) * 100 : 0;
    const pPending = totalVideos > 0 ? (pendingCount / totalVideos) * 100 : 0;
    const pRejected = totalVideos > 0 ? (rejectedCount / totalVideos) * 100 : 0;

    document.getElementById('prog-approved').style.width = `${pApproved}%`;
    document.getElementById('prog-pending').style.width = `${pPending}%`;
    document.getElementById('prog-rejected').style.width = `${pRejected}%`;
}

function renderDashboard() {
    const container = document.getElementById('profiles-container');
    container.innerHTML = "";

    let videos = [...appData]; 
    videos = sortVideos(videos);

    const section = document.createElement('div');
    section.className = 'profile-section';

    section.innerHTML = `
        <div class="video-list">
            ${videos.map(video => createVideoRow(video)).join('')}
            ${videos.length === 0 ? '<p style="color:#444; font-size:12px; font-style:italic; padding: 20px;">No videos found in this profile.</p>' : ''}
        </div>
    `;
    container.appendChild(section);
    
    if(isSelectionMode) updateSelectionUI();
}

function createVideoRow(video) {
    const isApproved = video.status === "Approved";
    const isRejected = video.status === "Rejected";
    
    let statusClass = 'status-pending';
    if (isApproved) statusClass = 'status-approved';
    if (isRejected) statusClass = 'status-rejected';
    
    const isSelected = selectedVideoIds.has(video.id);

    const viewsDisplay = video.views !== undefined 
        ? `<span class="view-count">
             <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
             ${formatViews(video.views)}
           </span>`
        : '';

    const likesDisplay = video.likes !== undefined 
        ? `<span class="view-count" title="Likes" style="margin-left: 12px;">
             <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
             ${formatViews(video.likes)}
           </span>`
        : '';

    const rawViews = video.views ? parseInt(video.views) : 0;
    const currentCpm = getProfileCpm(video.person, video.platform, video.profile);
    const estimatedRevenue = (rawViews / 1000) * currentCpm;

    const revenueBadge = estimatedRevenue > 0 
        ? `<span style="color: #ffa500; font-size: 14px; margin-left: 24px; font-weight: bold; margin-bottom: 4px">
            $${estimatedRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>`
        : '';

    // --- NEW LOGIC: Separate 24H Cooldowns for Views and Likes ---
    let viewsAutoDisabled = false;
    let viewsAutoClass = "";
    let viewsAutoTitle = "Start 24H Automation (4 Runs)";

    if (video.lastAutoViewsAt) {
        const lastViewsTime = video.lastAutoViewsAt.toDate ? video.lastAutoViewsAt.toDate().getTime() : video.lastAutoViewsAt;
        const hoursPassed = (Date.now() - lastViewsTime) / (1000 * 60 * 60);
        
        if (hoursPassed < 24) {
            viewsAutoDisabled = true;
            viewsAutoClass = "disabled-auto";
            viewsAutoTitle = `Cooldown Active: ${Math.ceil(24 - hoursPassed)}H remaining`;
        }
    }

    let likesAutoDisabled = false;
    let likesAutoClass = "";
    let likesAutoTitle = "Start 24H Automation (4 Runs)";

    if (video.lastAutoLikesAt) {
        const lastLikesTime = video.lastAutoLikesAt.toDate ? video.lastAutoLikesAt.toDate().getTime() : video.lastAutoLikesAt;
        const hoursPassed = (Date.now() - lastLikesTime) / (1000 * 60 * 60);
        
        if (hoursPassed < 24) {
            likesAutoDisabled = true;
            likesAutoClass = "disabled-auto";
            likesAutoTitle = `Cooldown Active: ${Math.ceil(24 - hoursPassed)}H remaining`;
        }
    }
    // --------------------------------------------------------------

    return `
        <div class="video-item ${isSelected ? 'selected' : ''}" 
             id="video-${video.id}"
             oncontextmenu="return false;"
             ontouchstart="handleRowTouchStart(event, '${video.id}')"
             ontouchend="handleRowTouchEnd(event)"
             ontouchmove="handleRowTouchMove(event)"
             onmousedown="handleRowMouseDown(event, '${video.id}')"
             onmouseup="handleRowMouseUp(event)"
             onclick="handleRowClick(event, '${video.id}')"
        >
            <div style="display: flex; width: 100%; align-items: center;">
                <div class="selection-checkbox">
                    <div class="checkbox-circle"></div>
                </div>

                <div class="video-info">
                    <div style="display: flex; align-items: center;">
                       <h4>${video.title}</h4>
                       ${revenueBadge}
                    </div>
                    <div style="display: flex; align-items: center; margin-top: 2px;">
                        ${viewsDisplay}
                        ${likesDisplay}
                    </div>
                </div>
                
                <div class="video-actions">
                    <div class="status-badge ${statusClass}" onclick="debouncedToggleStatus('${video.id}', '${video.status}')">
                        ${video.status}
                    </div>

                    <button class="icon-btn" onclick="toggleSmmPanel(event, '${video.id}')" style="color: #2ecc71; border-color: rgba(46, 204, 113, 0.3);" title="Boost Video">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                        </svg>
                    </button>

                    <div class="dropdown-container">
                        <button class="icon-btn delete-btn" onclick="toggleDropdown('${video.id}')">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                <path d="M3 7H21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                                <path d="M3 12H21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                                <path d="M3 17H21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                            </svg>
                        </button>
                        
                        <div id="dropdown-${video.id}" class="dropdown-menu hidden">
                             <div class="dropdown-item item-edit" onclick="openEditVideoModal('${video.id}')">
                                 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                 </svg>
                                 Edit Details
                             </div>
                             <div class="dropdown-item item-rejected" onclick="markAsRejected('${video.id}')">
                                 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <line x1="15" y1="9" x2="9" y2="15"></line>
                                    <line x1="9" y1="9" x2="15" y2="15"></line>
                                 </svg>
                                 Rejected
                             </div>
                             <div class="dropdown-item item-delete" onclick="deleteVideo('${video.id}')">
                                 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                 </svg>
                                 Delete
                             </div>
                             <a href="${video.link}" target="_blank" class="dropdown-item" style="text-decoration: none;">
                                 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                    <polyline points="15 3 21 3 21 9"></polyline>
                                    <line x1="10" y1="14" x2="21" y2="3"></line>
                                 </svg>
                                 Watch Video
                             </a>
                        </div>
                    </div>
                </div>
            </div>

            <div id="smm-panel-${video.id}" class="smm-panel hidden" data-provider="smmRaja" data-mode="views" data-exec="auto">
                
                <div style="display: flex; gap: 12px; flex-wrap: wrap; width: 100%; margin-bottom: 8px;">
                    <div class="smm-toggle-group">
                        <button class="smm-toggle-btn active" onclick="setSmmProvider(event, '${video.id}', 'smmRaja')" id="prov-raja-${video.id}" title="SMM Raja">R</button>
                        <button class="smm-toggle-btn" onclick="setSmmProvider(event, '${video.id}', 'smmPanelOne')" id="prov-one-${video.id}" title="SMM Panel One">O</button>
                    </div>
                
                    <div class="smm-toggle-group">
                        <button class="smm-toggle-btn active" onclick="setSmmMode(event, '${video.id}', 'views')" id="mode-views-${video.id}" title="Views">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                        </button>
                        <button class="smm-toggle-btn" onclick="setSmmMode(event, '${video.id}', 'likes')" id="mode-likes-${video.id}" title="Likes">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                        </button>
                    </div>

                    <div class="smm-toggle-group">
                        <button class="smm-toggle-btn active" onclick="setSmmExecMode(event, '${video.id}', 'auto')" id="exec-auto-${video.id}" title="Automatic (24H Drip-Feed)">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f39c12" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                        </button>
                        <button class="smm-toggle-btn" onclick="setSmmExecMode(event, '${video.id}', 'manual')" id="exec-manual-${video.id}" title="Manual (Instant Orders)">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3 13 14 8 9 3 14 12 23 21 14 16 9 11 14 11 3z"></path></svg>
                        </button>
                    </div>
                </div>

                <div style="display: flex; gap: 8px; flex-wrap: wrap; width: 100%; align-items: center;">
                    
                    <div class="smm-quantities" id="quantities-views-auto-${video.id}">
                        <button class="smm-qty-btn auto-qty-btn ${viewsAutoClass}" onclick="fireAutomation(event, '${video.id}', '${video.link}', 400, this)" ${viewsAutoDisabled ? 'disabled' : ''} title="${viewsAutoTitle}">400/24</button>
                        <button class="smm-qty-btn auto-qty-btn ${viewsAutoClass}" onclick="fireAutomation(event, '${video.id}', '${video.link}', 600, this)" ${viewsAutoDisabled ? 'disabled' : ''} title="${viewsAutoTitle}">600/24</button>
                        <button class="smm-qty-btn auto-qty-btn ${viewsAutoClass}" onclick="fireAutomation(event, '${video.id}', '${video.link}', 1000, this)" ${viewsAutoDisabled ? 'disabled' : ''} title="${viewsAutoTitle}">1000/24</button>
                    </div>

                    <div class="smm-quantities hidden" id="quantities-likes-auto-${video.id}">
                        <button class="smm-qty-btn auto-qty-btn ${likesAutoClass}" onclick="fireAutomation(event, '${video.id}', '${video.link}', 40, this)" ${likesAutoDisabled ? 'disabled' : ''} title="${likesAutoTitle}">40/24</button>
                        <button class="smm-qty-btn auto-qty-btn ${likesAutoClass}" onclick="fireAutomation(event, '${video.id}', '${video.link}', 60, this)" ${likesAutoDisabled ? 'disabled' : ''} title="${likesAutoTitle}">60/24</button>
                        <button class="smm-qty-btn auto-qty-btn ${likesAutoClass}" onclick="fireAutomation(event, '${video.id}', '${video.link}', 100, this)" ${likesAutoDisabled ? 'disabled' : ''} title="${likesAutoTitle}">100/24</button>
                    </div>

                    <div class="smm-quantities hidden" id="quantities-views-manual-${video.id}">
                        <button class="smm-qty-btn" onclick="submitSmmOrder(event, '${video.id}', '${video.link}', 100, this)">100</button>
                        <button class="smm-qty-btn" onclick="submitSmmOrder(event, '${video.id}', '${video.link}', 300, this)">300</button>
                        <button class="smm-qty-btn" onclick="submitSmmOrder(event, '${video.id}', '${video.link}', 1000, this)">1000</button>
                    </div>

                    <div class="smm-quantities hidden" id="quantities-likes-manual-${video.id}">
                        <button class="smm-qty-btn" onclick="submitSmmOrder(event, '${video.id}', '${video.link}', 10, this)">10</button>
                        <button class="smm-qty-btn" onclick="submitSmmOrder(event, '${video.id}', '${video.link}', 30, this)">30</button>
                        <button class="smm-qty-btn" onclick="submitSmmOrder(event, '${video.id}', '${video.link}', 100, this)">100</button>
                    </div>
                    
                    <div class="smm-custom-qty hidden" id="custom-qty-container-${video.id}">
                        <input type="number" id="custom-qty-${video.id}" class="smm-custom-input" placeholder="Qty">
                        <button class="smm-custom-btn" onclick="submitCustomSmm(event, '${video.id}', '${video.link}', this)">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                        </button>
                    </div>
                </div>

                <div class="smm-log" id="smm-log-${video.id}" style="margin-top: 8px;">
                    Last: ${video.lastSmmOrder ? video.lastSmmOrder : 'Never'}
                </div>
            </div>
        </div>
    `;
}

async function submitNewVideo() {
    const link = document.getElementById('new-link').value.trim();
    
    if(!link) {
        showToast('Please provide a video link', 'error');
        return;
    }

    // NEW: Smarter auto-naming to prevent duplicate numbers after deletion
    let maxNumber = 0;
    appData.forEach(video => {
        const num = parseInt(video.title);
        if (!isNaN(num) && num > maxNumber) {
            maxNumber = num;
        }
    });
    
    const title = String(maxNumber + 1);

    toggleAddModal(false);
    showLoading(true);

    const newVideo = {
        person: currentUser,
        platform: currentPlatform,
        profile: currentProfileKey,
        title: title, 
        link: link,
        status: "Pending", 
        views: 0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        await db.collection('videos').add(newVideo);
        showToast('Video added successfully!', 'success');
        document.getElementById('new-link').value = ""; 
    } catch (error) {
        showToast('Failed to save video', 'error');
        console.error(error);
    }
    showLoading(false);
}

async function refreshStats() {
    const btn = document.getElementById('refresh-btn');
    const btnText = btn.querySelector('span');
    const originalText = btnText.innerText;
    
    const videosToUpdate = appData.filter(v => v.link && v.link.startsWith('http'));

    if (videosToUpdate.length === 0) {
        showToast("No videos found to update.", "info");
        return;
    }

    btn.classList.add('refresh-loading');
    btn.disabled = true;
    
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < videosToUpdate.length; i++) {
        const video = videosToUpdate[i];
        btnText.innerText = `Checking ${i + 1}/${videosToUpdate.length}...`;

        try {
            const rootUrl = BACKEND_URL.replace('/refresh-stats', ''); 
            const targetUrl = `${rootUrl}/check-video`;

            const response = await fetch(targetUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: video.id,
                    url: video.link
                })
            });

            if (response.ok) {
                successCount++;
            } else {
                failCount++;
            }

        } catch (error) {
            failCount++;
        }
        await new Promise(r => setTimeout(r, 500));
    }

    btn.classList.remove('refresh-loading');
    btn.disabled = false;
    btnText.innerText = originalText;

    let msg = `Updated: ${successCount}`;
    if(failCount > 0) msg += ` | Skipped: ${failCount}`;
    
    showToast(msg, failCount > 0 ? 'info' : 'success');
}

function toggleSortMenu() {
    const menu = document.getElementById('sort-menu');
    if(menu) menu.classList.toggle('hidden');
}

function setSort(order) {
    currentSortOrder = order;
    toggleSortMenu();
    renderDashboard(); 
    const btnSpan = document.querySelector('#sort-btn span');
    if(btnSpan) {
        if(order === 'newest') btnSpan.innerText = 'NEWEST';
        else if(order === 'oldest') btnSpan.innerText = 'OLDEST';
        else if(order === 'views') btnSpan.innerText = 'VIEWS';
        else if(order === 'name') btnSpan.innerText = 'A-Z';
    }
}

function sortVideos(videos) {
    return videos.sort((a, b) => {
        if (currentSortOrder === 'views') {
            return (b.views ? parseInt(b.views) : 0) - (a.views ? parseInt(a.views) : 0);
        } else if (currentSortOrder === 'name') {
            return a.title.localeCompare(b.title);
        } else if (currentSortOrder === 'oldest') {
            const tA = a.createdAt ? a.createdAt.seconds : 0;
            const tB = b.createdAt ? b.createdAt.seconds : 0;
            return tA - tB;
        } else {
            const tA = a.createdAt ? a.createdAt.seconds : 0;
            const tB = b.createdAt ? b.createdAt.seconds : 0;
            return tB - tA;
        }
    });
}

function formatViews(n) {
    if (!n) return '0';
    if (n < 1000) return n;
    if (n < 1000000) return (n / 1000).toFixed(1) + 'K';
    return (n / 1000000).toFixed(1) + 'M';
}

function handleRowTouchStart(e, id) {
    if (isSelectionMode) return;
    longPressTimer = setTimeout(() => { enterSelectionMode(id); if (navigator.vibrate) navigator.vibrate(50); }, LONG_PRESS_DURATION);
}
function handleRowTouchEnd() { if (longPressTimer) clearTimeout(longPressTimer); }
function handleRowTouchMove() { if (longPressTimer) clearTimeout(longPressTimer); }
function handleRowMouseDown(e, id) { if (isSelectionMode) return; if (e.button !== 0) return; longPressTimer = setTimeout(() => enterSelectionMode(id), LONG_PRESS_DURATION); }
function handleRowMouseUp() { if (longPressTimer) clearTimeout(longPressTimer); }

function handleRowClick(e, id) {
    if (isSelectionMode) {
        e.preventDefault(); e.stopPropagation();
        toggleSelection(id);
    }
}

function enterSelectionMode(initialId) {
    isSelectionMode = true; selectedVideoIds.clear(); toggleSelection(initialId);
    document.body.classList.add('selection-mode');
    document.getElementById('nav-logo-group').classList.add('hidden');
    document.getElementById('selection-actions').classList.remove('hidden');
    renderDashboard();
}

function toggleSelectAll() {
    // Check if all displayed videos are currently selected
    const allSelected = appData.length > 0 && selectedVideoIds.size === appData.length;
    
    if (allSelected) {
        // If all are selected, deselect them all
        selectedVideoIds.clear();
    } else {
        // Otherwise, select every video currently in appData
        appData.forEach(video => selectedVideoIds.add(video.id));
    }
    
    updateSelectionUI();
}

function exitSelectionMode() {
    isSelectionMode = false; selectedVideoIds.clear();
    document.body.classList.remove('selection-mode');
    document.getElementById('nav-logo-group').classList.remove('hidden');
    document.getElementById('selection-actions').classList.add('hidden');
    const fab = document.getElementById('main-fab');
    fab.innerText = "+ ADD VIDEO";
    fab.classList.remove('fab-delete-mode');
    renderDashboard();
}

function toggleSelection(id) {
    if (selectedVideoIds.has(id)) selectedVideoIds.delete(id); else selectedVideoIds.add(id);
    updateSelectionUI();
}

function updateSelectionUI() {
    document.querySelectorAll('.video-item').forEach(row => {
        const id = row.id.replace('video-', '');
        if (selectedVideoIds.has(id)) row.classList.add('selected'); else row.classList.remove('selected');
    });
    const fab = document.getElementById('main-fab');
    if (selectedVideoIds.size > 0) {
        fab.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg> DELETE (${selectedVideoIds.size})`;
        fab.classList.add('fab-delete-mode');
    } else {
        fab.innerHTML = "SELECT ITEMS";
        fab.classList.remove('fab-delete-mode');
    }
    // NEW: Update Select All button text
    const selectAllBtn = document.getElementById('select-all-btn');
    if (selectAllBtn) {
        if (appData.length > 0 && selectedVideoIds.size === appData.length) {
            selectAllBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> DESELECT ALL`;
        } else {
             selectAllBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg> SELECT ALL`;
        }
    }
}

function handleFabClick() {
    if (isSelectionMode) {
        if (selectedVideoIds.size > 0) deleteSelectedVideos();
        else showToast("Select videos to delete", "info");
    } else {
        document.getElementById('add-modal-subtitle').innerText = `Adding to: ${currentUser} > ${currentProfileName}`;
        toggleAddModal(true);
    }
}

async function deleteSelectedVideos() {
    if (!confirm(`Delete ${selectedVideoIds.size} videos?`)) return;
    showLoading(true);
    const batch = db.batch();
    selectedVideoIds.forEach(id => { batch.delete(db.collection('videos').doc(id)); });
    try { await batch.commit(); showToast(`Deleted.`, 'success'); exitSelectionMode(); }
    catch (error) { showToast("Error.", "error"); }
    showLoading(false);
}

function toggleDropdown(id) {
    if (isSelectionMode) return;
    document.querySelectorAll('.dropdown-menu').forEach(menu => { if(menu.id !== `dropdown-${id}`) menu.classList.add('hidden'); });
    const menu = document.getElementById(`dropdown-${id}`);
    if (menu) menu.classList.toggle('hidden');
}

async function markAsRejected(id) {
    try { await db.collection('videos').doc(id).update({ status: "Rejected" }); showToast('Status updated', 'info'); } 
    catch (error) { showToast('Failed', 'error'); }
    const menu = document.getElementById(`dropdown-${id}`); if(menu) menu.classList.add('hidden');
}

const debouncedToggleStatus = debounce(async function(id, currentStatus) {
    if (isSelectionMode) return;
    let newStatus = currentStatus === "Approved" ? "Pending" : "Approved";
    try { await db.collection('videos').doc(id).update({ status: newStatus }); showToast(`Updated to ${newStatus}`, 'success'); } 
    catch (error) { showToast('Failed', 'error'); }
}, 300);

function openEditVideoModal(id) {
    const video = appData.find(v => v.id === id);
    if (!video) return;
    currentEditingId = id;
    document.getElementById('edit-title').value = video.title;
    document.getElementById('edit-link').value = video.link;
    document.querySelectorAll('.dropdown-menu').forEach(menu => menu.classList.add('hidden'));
    toggleEditVideoModal(true);
}

function toggleEditVideoModal(show) {
    const modal = document.getElementById('edit-video-modal');
    if(show) modal.classList.remove('hidden'); else modal.classList.add('hidden');
}

async function saveVideoEdit() {
    if (!currentEditingId) return;
    const title = document.getElementById('edit-title').value.trim();
    const link = document.getElementById('edit-link').value.trim();
    if(!title || !link) return;
    toggleEditVideoModal(false); showLoading(true);
    try { await db.collection('videos').doc(currentEditingId).update({ title: title, link: link }); showToast('Updated!', 'success'); } 
    catch (error) { showToast('Failed', 'error'); }
    showLoading(false); currentEditingId = null;
}

async function deleteVideo(id) {
    if(!confirm("Delete?")) return;
    try { await db.collection('videos').doc(id).delete(); showToast('Deleted', 'success'); } 
    catch (error) { showToast('Failed', 'error'); }
}

function openProfileSettings() {
    const modal = document.getElementById('profile-settings-modal');
    const container = document.getElementById('dynamic-profile-inputs');
    container.innerHTML = ''; 
    const profiles = getProfileData();
    profiles.forEach(p => {
        const row = document.createElement('div');
        row.style.display = 'flex'; row.style.gap = '8px'; row.style.alignItems = 'center'; row.style.marginBottom = '10px'; row.className = 'profile-input-row';
        
        // Profile Name Input
        const input = document.createElement('input');
        input.type = 'text'; input.value = p.name; input.dataset.dbkey = p.dbKey; input.className = 'mamba-input'; input.style.marginTop = '0'; 
        
        // NEW CPM Input
        const cpmInput = document.createElement('input');
        cpmInput.type = 'number'; cpmInput.step = '0.01'; cpmInput.value = getProfileCpm(currentUser, currentPlatform, p.dbKey);
        cpmInput.dataset.dbkey = p.dbKey; cpmInput.className = 'mamba-input cpm-input'; 
        cpmInput.style.marginTop = '0'; cpmInput.style.width = '80px'; cpmInput.style.minWidth = '70px'; cpmInput.title = "CPM ($ per 1K views)";
        
        const delBtn = document.createElement('button');
        delBtn.className = 'icon-btn delete-btn'; delBtn.style.marginTop = '0'; delBtn.style.minWidth = '38px';
        delBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
        delBtn.onclick = () => row.remove();
        
        row.appendChild(input); row.appendChild(cpmInput); row.appendChild(delBtn); container.appendChild(row);
    });
    modal.classList.remove('hidden');
}

function addNewProfileField() {
    const container = document.getElementById('dynamic-profile-inputs');
    let maxIndex = 0;
    container.querySelectorAll('input').forEach(inp => {
        const num = parseInt(inp.dataset.dbkey.replace('profile', ''));
        if (!isNaN(num) && num > maxIndex) maxIndex = num;
    });
    const newIndex = maxIndex + 1;
    const row = document.createElement('div');
    row.style.display = 'flex'; row.style.gap = '8px'; row.style.alignItems = 'center'; row.style.marginBottom = '10px'; row.className = 'profile-input-row';
    
    // Profile Name Input
    const input = document.createElement('input');
    input.type = 'text'; input.placeholder = `New Profile Name`; input.dataset.dbkey = `profile${newIndex}`; input.className = 'mamba-input'; input.style.marginTop = '0';
    
    // NEW CPM Input Default
    const cpmInput = document.createElement('input');
    cpmInput.type = 'number'; cpmInput.step = '0.01'; cpmInput.value = '1.50';
    cpmInput.dataset.dbkey = `profile${newIndex}`; cpmInput.className = 'mamba-input cpm-input'; 
    cpmInput.style.marginTop = '0'; cpmInput.style.width = '80px'; cpmInput.style.minWidth = '70px';
    
    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn delete-btn'; delBtn.style.marginTop = '0'; delBtn.style.minWidth = '38px';
    delBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
    delBtn.onclick = () => row.remove();
    
    row.appendChild(input); row.appendChild(cpmInput); row.appendChild(delBtn); container.appendChild(row); input.focus();
}

async function saveProfileNames() {
    const rows = document.querySelectorAll('.profile-input-row');
    const updates = {}; const localConfig = {}; 
    const localCpmConfig = {}; const activeKeys = new Set();
    let hasError = false;
    const existingProfiles = getProfileData();
    const existingKeys = existingProfiles.map(p => p.dbKey);
    
    rows.forEach((row) => {
        // Handle names
        const nameInput = row.querySelectorAll('input')[0];
        const val = nameInput.value.trim();
        const dbKey = nameInput.dataset.dbkey;
        
        // Handle CPM
        const cpmInput = row.querySelectorAll('.cpm-input')[0];
        const cpmVal = parseFloat(cpmInput.value) || 1.50;

        if (!val) hasError = true;
        activeKeys.add(dbKey);
        
        updates[`profileConfig.${currentUser}.${currentPlatform}.${dbKey}`] = val;
        updates[`betaCpmConfig.${currentUser}.${currentPlatform}.${dbKey}`] = cpmVal; // Parallel save to firebase
        
        localConfig[dbKey] = val;
        localCpmConfig[dbKey] = cpmVal;
    });
    
    if (hasError) { showToast('All fields must be filled', 'error'); return; }
    
    existingKeys.forEach(key => {
        if (!activeKeys.has(key)) {
            updates[`profileConfig.${currentUser}.${currentPlatform}.${key}`] = firebase.firestore.FieldValue.delete();
            updates[`betaCpmConfig.${currentUser}.${currentPlatform}.${key}`] = firebase.firestore.FieldValue.delete();
        }
    });
    showLoading(true);
    
    try {
        await db.collection('settings').doc('global').update(updates);
        
        // Update Local Configurations instantly
        if (!profileConfig[currentUser]) profileConfig[currentUser] = {};
        profileConfig[currentUser][currentPlatform] = localConfig;
        
        if (!cpmConfig[currentUser]) cpmConfig[currentUser] = {};
        cpmConfig[currentUser][currentPlatform] = localCpmConfig;
        
        if(document.getElementById('profile-select-view').classList.contains('active')) renderProfileSelectionList();
        if(document.getElementById('dashboard-view').classList.contains('active')) renderDashboard(); 
        
        showToast('Saved!', 'success'); toggleProfileSettingsModal(false);
    } catch (error) { console.error(error); showToast('Error saving.', 'error'); }
    showLoading(false);
}

function toggleProfileSettingsModal(show) {
    const modal = document.getElementById('profile-settings-modal');
    if (show) modal.classList.remove('hidden'); else modal.classList.add('hidden');
}

function toggleAddModal(show) {
    const modal = document.getElementById('add-modal');
    if(show) modal.classList.remove('hidden'); else modal.classList.add('hidden');
}

function showLoading(show) {
    const dot = document.getElementById('loading-indicator');
    if(show) {
        dot.style.background = "#ff4444"; dot.style.boxShadow = "0 0 10px #ff4444";
        dot.innerHTML = `<svg width="8" height="8" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#ff4444" stroke-width="4" stroke-dasharray="30" stroke-dashoffset="30"></circle></svg>`;
    } else { dot.style.background = "transparent"; dot.style.boxShadow = "none"; dot.innerHTML = ""; }
}

function getPlatformLogo(platform) {
    if (platform === 'Instagram') return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ff4444" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>`;
    if (platform === 'TikTok') return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" stroke="#ff4444" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    return '';
}

function openPasswordsModal() { togglePasswordsModal(true); renderPasswords(); }
function togglePasswordsModal(show) { const modal = document.getElementById('passwords-modal'); if (show) modal.classList.remove('hidden'); else modal.classList.add('hidden'); }
function renderPasswords() {
    const container = document.getElementById('passwords-container'); container.innerHTML = '';
    const users = Object.keys(passwordsData);
    if (users.length === 0) { container.innerHTML = `<p style="text-align:center;color:#666;">No passwords found.</p>`; return; }
    users.forEach(user => {
        const userSection = document.createElement('div'); userSection.style.marginBottom = '30px';
        const userHeader = document.createElement('h4'); userHeader.textContent = `User : ${user}`; userHeader.style.color = '#ff4444'; userHeader.style.marginBottom = '15px'; userHeader.style.borderBottom = '1px solid #333'; userSection.appendChild(userHeader);
        ['Instagram', 'TikTok'].forEach(platform => {
            if (!passwordsData[user][platform]) return;
            passwordsData[user][platform].forEach(profileData => {
                const div = document.createElement('div'); div.className = 'password-entry';
                div.innerHTML = `<div class="platform-logo">${getPlatformLogo(platform)}</div><div class="password-info"><span class="profile-label">${profileData.profileName||'Not set'}</span><span style="color:#666"> - </span><span class="password-text">${profileData.password||'******'}</span></div><button class="copy-password-btn" onclick="navigator.clipboard.writeText('${profileData.password}')">COPY</button>`;
                userSection.appendChild(div);
            });
        });
        container.appendChild(userSection);
    });
}

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferredPrompt = e;
    const homeBtn = document.getElementById('install-container-home');
    const settingsBtn = document.getElementById('install-container-settings');
    if(homeBtn) homeBtn.classList.remove('hidden');
    if(settingsBtn) settingsBtn.classList.remove('hidden');
});
async function installPWA() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if(outcome === 'accepted'){
        document.getElementById('install-container-home').classList.add('hidden');
        document.getElementById('install-container-settings').classList.add('hidden');
    }
}