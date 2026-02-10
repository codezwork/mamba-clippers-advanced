//
// --- CONFIGURATION ---
// PASTE YOUR FIREBASE CONFIG HERE FROM CONSOLE
const firebaseConfig = {
  apiKey: "AIzaSyDqI6yHiHJ7Ao257KmVaTSOPJ7C3hd9V7U",
  authDomain: "mambaclippers.firebaseapp.com",
  projectId: "mambaclippers",
  storageBucket: "mambaclippers.firebasestorage.app",
  messagingSenderId: "400915321062",
  appId: "1:400915321062:web:8a8ee616725d40ea47eb27"
};

// --- BACKEND URL ---
// REPLACE THIS WITH YOUR ACTUAL RENDER URL AFTER DEPLOYING
const BACKEND_URL = "https://mamba-clippers-backend-views-scrapper.onrender.com/refresh-stats";

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// --- STATE MANAGEMENT ---
let appData = [];
let currentUser = "";
let currentPlatform = "TikTok"; 
let isLoading = false;
let profileConfig = {};
let passwordsData = {};
let unsubscribeVideos = null;

// --- DEBOUNCE UTILITY ---
let debounceTimer;
function debounce(func, delay) {
    return function(...args) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => func.apply(this, args), delay);
    };
}

// --- TOAST NOTIFICATION SYSTEM ---
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
    
    setTimeout(() => {
        if (toast.parentElement) toast.remove();
    }, 3000);
}

// --- INITIALIZATION ---
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

    // Global listener to close dropdowns when clicking outside
    document.addEventListener('click', function(event) {
        if (!event.target.closest('.dropdown-container')) {
            document.querySelectorAll('.dropdown-menu').forEach(menu => {
                menu.classList.add('hidden');
            });
        }
    });
});

// --- NAVIGATION FUNCTIONS ---
function openDashboard(user) {
    currentUser = user;
    document.getElementById('current-user-name').innerText = user.toUpperCase();
    
    document.getElementById('home-view').classList.add('hidden');
    document.getElementById('dashboard-view').classList.remove('hidden');
    document.getElementById('dashboard-view').classList.add('active');

    fetchData(); 
}

function goHome() {
    document.getElementById('dashboard-view').classList.add('hidden');
    document.getElementById('home-view').classList.remove('hidden');
    appData = [];
    
    if (unsubscribeVideos) {
        unsubscribeVideos();
        unsubscribeVideos = null;
    }
}

function switchPlatform(platform, element) {
    currentPlatform = platform;
    document.querySelectorAll('.bottom-nav .nav-item').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    renderDashboard();
}

// --- DATA HANDLING (FIRESTORE) ---
async function fetchData() {
  showLoading(true);
  try {
    // 1. Fetch Profile Config (from global settings)
    const settingsDoc = await db.collection('settings').doc('global').get();
    if (settingsDoc.exists) {
        profileConfig = settingsDoc.data().profileConfig || {};
    }

    // 2. Fetch Passwords
    const passwordsSnapshot = await db.collection('passwords log').get();
    passwordsData = {};
    passwordsSnapshot.forEach(doc => {
        passwordsData[doc.id] = doc.data();
    });

    // 3. Real-time listener for Videos
    if (unsubscribeVideos) unsubscribeVideos();

    unsubscribeVideos = db.collection('videos')
        .where('person', '==', currentUser)
        .onSnapshot((snapshot) => {
            appData = [];
            snapshot.forEach((doc) => {
                appData.push({ ...doc.data(), id: doc.id });
            });
            renderDashboard();
            showLoading(false);
        }, (error) => {
            console.error("Firestore Error:", error);
            showToast('Error syncing data.', 'error');
            showLoading(false);
        });

  } catch (error) {
    showToast('Error loading data.', 'error');
    console.error('Fetch error:', error);
    showLoading(false);
  }
}

function getCurrentProfileNames() {
    if (profileConfig[currentUser] && profileConfig[currentUser][currentPlatform]) {
        const config = profileConfig[currentUser][currentPlatform];
        return [
            config.profile1 || "Profile 1",
            config.profile2 || "Profile 2", 
            config.profile3 || "Profile 3"
        ];
    }
    return ["Profile 1", "Profile 2", "Profile 3"];
}

function updateProfileDropdown() {
    const select = document.getElementById('new-profile-select');
    if (!select) return;
    
    select.innerHTML = '';
    const profileNames = getCurrentProfileNames();
    
    profileNames.forEach((name, index) => {
        const option = document.createElement('option');
        option.value = `Profile ${index + 1}`; 
        option.textContent = name;
        select.appendChild(option);
    });
}

// --- HELPER: Format View Count ---
// Moved outside so it can be used by both createVideoRow and renderDashboard
function formatViews(n) {
    if (!n) return '0';
    if (n < 1000) return n;
    if (n < 1000000) return (n / 1000).toFixed(1) + 'K';
    return (n / 1000000).toFixed(1) + 'M';
}

function renderDashboard() {
    const container = document.getElementById('profiles-container');
    container.innerHTML = "";

    const profileNames = getCurrentProfileNames();
    const filteredData = appData.filter(item => item.platform === currentPlatform);

    const grouped = {};
    ["Profile 1", "Profile 2", "Profile 3"].forEach(p => grouped[p] = []);
    
    filteredData.forEach(item => {
        if (grouped[item.profile]) {
            grouped[item.profile].push(item);
        }
    });

    ["Profile 1", "Profile 2", "Profile 3"].forEach((profileKey, index) => {
        const videos = grouped[profileKey];
        const displayName = profileNames[index];
        
        const total = videos.length;
        const approved = videos.filter(v => v.status === "Approved").length;
        const progressPct = total === 0 ? 0 : (approved / total) * 100;

        // --- NEW: CALCULATE TOTAL VIEWS FOR PROFILE ---
        const totalProfileViews = videos.reduce((acc, curr) => {
            const v = curr.views ? parseInt(curr.views) : 0;
            return acc + v;
        }, 0);
        
        const formattedTotalViews = formatViews(totalProfileViews);

        const section = document.createElement('div');
        section.className = 'profile-section';
        
        section.innerHTML = `
            <div class="profile-header">
                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                    <h3 style="color:#fff; font-size: 16px;">${displayName}</h3>
                    
                    <button class="icon-btn edit-btn" onclick="openProfileSettings(${index})" style="padding: 4px;">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                            <path d="M11 2H9C4 2 2 4 2 9V15C2 20 4 22 9 22H15C20 22 22 20 22 15V13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M16.04 3.02001L8.16 10.9C7.86 11.2 7.56 11.79 7.5 12.22L7.07 15.23C6.91 16.32 7.68 17.08 8.77 16.93L11.78 16.5C12.2 16.44 12.79 16.14 13.1 15.84L20.98 7.96001C22.34 6.60001 22.98 5.02001 20.98 3.02001C18.98 1.02001 17.4 1.66001 16.04 3.02001Z" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M14.91 4.15002C15.58 6.54002 17.45 8.41002 19.85 9.09002" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>

                    <div class="total-views-badge">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                        ${formattedTotalViews}
                    </div>

                </div>
                <span style="color:#666; font-size: 12px;">${approved}/${total} Approved</span>
            </div>
            <div class="progress-track">
                <div class="progress-fill" style="width: ${progressPct}%"></div>
            </div>
            <div class="video-list">
                ${videos.map(video => createVideoRow(video)).join('')}
                ${videos.length === 0 ? '<p style="color:#444; font-size:12px; font-style:italic;">No videos yet.</p>' : ''}
            </div>
        `;
        container.appendChild(section);
    });
    
    updateProfileDropdown();
}

function createVideoRow(video) {
    const isApproved = video.status === "Approved";
    const isRejected = video.status === "Rejected";
    
    // Class determination
    let statusClass = 'status-pending';
    if (isApproved) statusClass = 'status-approved';
    if (isRejected) statusClass = 'status-rejected';
    
    const viewsDisplay = video.views !== undefined 
        ? `<span class="view-count">
             <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
             ${formatViews(video.views)}
           </span>`
        : '';

    return `
        <div class="video-item">
            <div class="video-info">
                <h4>${video.title}</h4>
                <a href="${video.link}" target="_blank">Watch Video &#8599;</a>
                ${viewsDisplay}
            </div>
            <div class="video-actions">
                <div class="status-badge ${statusClass}" onclick="debouncedToggleStatus('${video.id}', '${video.status}')">
                    ${video.status}
                </div>

                <button class="icon-btn copy-btn" onclick="copyLink('${video.link}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M16 12.9V17.1C16 20.6 14.6 22 11.1 22H6.9C3.4 22 2 20.6 2 17.1V12.9C2 9.4 3.4 8 6.9 8H11.1C14.6 8 16 9.4 16 12.9Z" stroke="currentColor" stroke-width="1.5"/>
                        <path d="M22 6.9V11.1C22 14.6 20.6 16 17.1 16H16V12.9C16 9.4 14.6 8 11.1 8H8V6.9C8 3.4 9.4 2 12.9 2H17.1C20.6 2 22 3.4 22 6.9Z" stroke="currentColor" stroke-width="1.5"/>
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
                    </div>
                </div>

            </div>
        </div>
    `;
}

// --- REFRESH STATS FUNCTION (NEW) ---
// --- REVISED REFRESH STATS FUNCTION (ONE-BY-ONE) ---
async function refreshStats() {
    const btn = document.getElementById('refresh-btn');
    const btnText = btn.querySelector('span');
    const originalText = btnText.innerText;
    
    // 1. Get List of Videos to Update
    // We filter for videos that belong to the current user and have a link
    const videosToUpdate = appData.filter(v => v.link && v.link.startsWith('http'));

    if (videosToUpdate.length === 0) {
        showToast("No videos found to update.", "info");
        return;
    }

    // 2. Enter Loading State
    btn.classList.add('refresh-loading');
    btn.disabled = true;
    
    let successCount = 0;
    let failCount = 0;

    // 3. Loop through videos one by one
    // We use a regular for...of loop to ensure they happen in order (Sequential)
    // This prevents overwhelming the server or getting rate-limited
    for (let i = 0; i < videosToUpdate.length; i++) {
        const video = videosToUpdate[i];
        
        // Update Button Text with Progress
        btnText.innerText = `Checking ${i + 1}/${videosToUpdate.length}...`;

        try {
            // Updated Endpoint: /check-video
            // Note: Make sure BACKEND_URL points to the root, or adjust this line
            // If BACKEND_URL is "https://.../refresh-stats", change it to just "https://...onrender.com"
            // Or just hardcode the new endpoint here:
            
            const rootUrl = BACKEND_URL.replace('/refresh-stats', ''); // simple cleanup just in case
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
                console.warn(`Failed to update ${video.title}`);
            }

        } catch (error) {
            console.error(`Error updating ${video.title}:`, error);
            failCount++;
        }
        
        // Small pause to be gentle on the server (optional)
        await new Promise(r => setTimeout(r, 500));
    }

    // 4. Reset Button State & Show Summary
    btn.classList.remove('refresh-loading');
    btn.disabled = false;
    btnText.innerText = originalText;

    if (successCount > 0) {
        showToast(`Updated ${successCount} videos! (${failCount} skipped)`, 'success');
    } else {
        showToast('Update finished, but no videos changed.', 'info');
    }
}

// --- ACTIONS (CRUD) ---

// Toggle Dropdown Visibility
function toggleDropdown(id) {
    // Close all other open dropdowns first
    document.querySelectorAll('.dropdown-menu').forEach(menu => {
        if(menu.id !== `dropdown-${id}`) menu.classList.add('hidden');
    });

    const menu = document.getElementById(`dropdown-${id}`);
    if (menu) {
        menu.classList.toggle('hidden');
    }
}

// Mark as Rejected
async function markAsRejected(id) {
    try {
        await db.collection('videos').doc(id).update({
            status: "Rejected"
        });
        showToast('Status updated to Rejected', 'info');
    } catch (error) {
        showToast('Failed to update status', 'error');
        console.error(error);
    }
    // Close dropdown immediately
    const menu = document.getElementById(`dropdown-${id}`);
    if(menu) menu.classList.add('hidden');
}

const debouncedToggleStatus = debounce(async function(id, currentStatus) {
    // Logic: 
    // If "Approved" -> go to "Pending"
    // If "Pending" -> go to "Approved"
    // If "Rejected" -> go to "Approved" (as per user request: "when clicked it will turn the status 'Approved'")
    
    let newStatus = "Approved";
    
    if (currentStatus === "Approved") {
        newStatus = "Pending";
    } else if (currentStatus === "Pending") {
        newStatus = "Approved";
    } else if (currentStatus === "Rejected") {
        newStatus = "Approved";
    }
    
    try {
        await db.collection('videos').doc(id).update({
            status: newStatus
        });
        showToast(`Status updated to ${newStatus}`, 'success');
    } catch (error) {
        showToast('Failed to update status', 'error');
        console.error(error);
    }
}, 300);

async function submitNewVideo() {
    const profile = document.getElementById('new-profile-select').value;
    const title = document.getElementById('new-title').value.trim();
    const link = document.getElementById('new-link').value.trim();
    
    if(!title || !link) {
        showToast('Please fill all fields', 'error');
        return;
    }

    toggleAddModal(false);
    showLoading(true);

    const newVideo = {
        person: currentUser,
        platform: currentPlatform,
        profile: profile,
        title: title,
        link: link,
        status: "Pending", // Default status
        views: 0 // Default views
    };

    try {
        await db.collection('videos').add(newVideo);
        showToast('Video added successfully!', 'success');
        document.getElementById('new-title').value = "";
        document.getElementById('new-link').value = "";
    } catch (error) {
        showToast('Failed to save video', 'error');
        console.error(error);
    }
    showLoading(false);
}

async function deleteVideo(id) {
    if(!confirm("Are you sure you want to delete this video?")) return;

    try {
        await db.collection('videos').doc(id).delete();
        showToast('Video deleted', 'success');
    } catch (error) {
        showToast('Failed to delete video', 'error');
        console.error(error);
    }
}

// --- PROFILE SETTINGS FUNCTIONS ---
function openProfileSettings(profileIndex = null) {
    const modal = document.getElementById('profile-settings-modal');
    const profileNames = getCurrentProfileNames();
    
    document.getElementById('profile-name-1').value = profileNames[0];
    document.getElementById('profile-name-2').value = profileNames[1];
    document.getElementById('profile-name-3').value = profileNames[2];
    
    modal.classList.remove('hidden');
    
    if (profileIndex !== null) {
        setTimeout(() => {
            document.getElementById(`profile-name-${profileIndex + 1}`).focus();
        }, 100);
    }
}

function toggleProfileSettingsModal(show) {
    const modal = document.getElementById('profile-settings-modal');
    if (show) modal.classList.remove('hidden');
    else modal.classList.add('hidden');
}

async function saveProfileNames() {
    const profile1 = document.getElementById('profile-name-1').value.trim();
    const profile2 = document.getElementById('profile-name-2').value.trim();
    const profile3 = document.getElementById('profile-name-3').value.trim();
    
    if (!profile1 || !profile2 || !profile3) {
        showToast('All profile names are required', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        const updateField = `profileConfig.${currentUser}.${currentPlatform}`;
        
        await db.collection('settings').doc('global').update({
            [`${updateField}.profile1`]: profile1,
            [`${updateField}.profile2`]: profile2,
            [`${updateField}.profile3`]: profile3
        });
        
        if (!profileConfig[currentUser]) profileConfig[currentUser] = {};
        profileConfig[currentUser][currentPlatform] = { profile1, profile2, profile3 };
        
        renderDashboard();
        showToast('Profile names updated!', 'success');
        toggleProfileSettingsModal(false);
        
    } catch (error) {
        if (error.code === 'not-found') {
            await db.collection('settings').doc('global').set({
                 profileConfig: {
                     [currentUser]: {
                         [currentPlatform]: { profile1, profile2, profile3 }
                     }
                 }
            }, { merge: true });
            renderDashboard();
            showToast('Profile names updated!', 'success');
            toggleProfileSettingsModal(false);
        } else {
            showToast('Failed to update profile names', 'error');
            console.error('Error saving profile names:', error);
        }
    }
    
    showLoading(false);
}

// --- UTILITIES ---
function toggleAddModal(show) {
    const modal = document.getElementById('add-modal');
    if(show) modal.classList.remove('hidden');
    else modal.classList.add('hidden');
}

async function copyLink(link) {
    try {
        await navigator.clipboard.writeText(link);
        showToast('Link copied to clipboard!', 'success');
    } catch (error) {
        showToast('Failed to copy link', 'error');
    }
}

function showLoading(show) {
    const dot = document.getElementById('loading-indicator');
    if(show) {
        dot.style.background = "#ff4444";
        dot.style.boxShadow = "0 0 10px #ff4444";
        dot.innerHTML = `<svg width="8" height="8" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#ff4444" stroke-width="4" stroke-dasharray="30" stroke-dashoffset="30"></circle></svg>`;
    } else {
        dot.style.background = "transparent";
        dot.style.boxShadow = "none";
        dot.innerHTML = "";
    }
}

function getPlatformLogo(platform) {
  if (platform === 'Instagram') {
    return `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ff4444" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;">
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
      </svg>
    `;
  } else if (platform === 'TikTok') {
    return `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="margin-right: 8px;">
        <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" stroke="#ff4444" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  }
  return '';
}

// --- PASSWORD MANAGEMENT ---
function openPasswordsModal() {
  togglePasswordsModal(true);
  renderPasswords();
}

function togglePasswordsModal(show) {
  const modal = document.getElementById('passwords-modal');
  if (show) modal.classList.remove('hidden');
  else modal.classList.add('hidden');
}

function renderPasswords() {
  const container = document.getElementById('passwords-container');
  container.innerHTML = '';
  
  const users = Object.keys(passwordsData);
  
  if (users.length === 0) {
      container.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; color: #666;">
        <p>No passwords found.</p>
        <p style="font-size: 12px; margin-top: 10px;">Check 'passwords log' collection.</p>
      </div>`;
      return;
  }

  users.forEach(user => {
    const userSection = document.createElement('div');
    userSection.style.marginBottom = '30px';
    
    const userHeader = document.createElement('h4');
    userHeader.textContent = `User : ${user}`;
    userHeader.style.color = '#ff4444';
    userHeader.style.marginBottom = '15px';
    userHeader.style.fontSize = '16px';
    userHeader.style.borderBottom = '1px solid #333';
    userHeader.style.paddingBottom = '5px';
    
    userSection.appendChild(userHeader);
    
    const platforms = ['Instagram', 'TikTok'];
    
    platforms.forEach(platform => {
      if (!passwordsData[user][platform] || passwordsData[user][platform].length === 0) return;
      
      const platformProfiles = passwordsData[user][platform];
      
      platformProfiles.forEach(profileData => {
        const profileDiv = document.createElement('div');
        profileDiv.className = 'password-entry';
        
        const logoDiv = document.createElement('div');
        logoDiv.className = 'platform-logo';
        logoDiv.innerHTML = getPlatformLogo(platform);
        profileDiv.appendChild(logoDiv);
        
        const profileInfo = document.createElement('div');
        profileInfo.className = 'password-info';
        
        const profileName = document.createElement('span');
        profileName.className = 'profile-label';
        profileName.textContent = `${profileData.profileName || 'Not set'}`;
        
        const sep = document.createElement('span');
        sep.innerText = " - ";
        sep.style.color = "#666";

        const passwordSpan = document.createElement('span');
        passwordSpan.className = 'password-text';
        passwordSpan.textContent = profileData.password || '******';
        
        profileInfo.appendChild(profileName);
        profileInfo.appendChild(sep);
        profileInfo.appendChild(passwordSpan);
        profileDiv.appendChild(profileInfo);
        
        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-password-btn';
        copyBtn.innerText = "COPY";
        copyBtn.onclick = () => copyPassword(profileData.password);
        profileDiv.appendChild(copyBtn);
        
        userSection.appendChild(profileDiv);
      });
    });
    
    container.appendChild(userSection);
  });
}

function copyPassword(password) {
  if (!password) {
    showToast('No password to copy', 'error');
    return;
  }
  copyLink(password);
}

// --- PWA INSTALLATION LOGIC ---
let deferredPrompt;

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js')
            .then(reg => console.log('Service Worker Registered'))
            .catch(err => console.log('Service Worker Error:', err));
    });
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    
    const homeBtn = document.getElementById('install-container-home');
    const settingsBtn = document.getElementById('install-container-settings');
    
    if(homeBtn) homeBtn.classList.remove('hidden');
    if(settingsBtn) settingsBtn.classList.remove('hidden');
});

async function installPWA() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response: ${outcome}`);
    deferredPrompt = null;
    
    if(outcome === 'accepted'){
        document.getElementById('install-container-home').classList.add('hidden');
        document.getElementById('install-container-settings').classList.add('hidden');
    }
}

window.addEventListener('appinstalled', () => {
    document.getElementById('install-container-home').classList.add('hidden');
    document.getElementById('install-container-settings').classList.add('hidden');
});
