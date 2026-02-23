const SMM_BACKEND_URL = "https://mamba-clippers-backend-smm.onrender.com/api/test-smm"; // Update this later

// Toggles the expandable panel
function toggleSmmPanel(e, videoId) {
    e.stopPropagation(); // Prevents selection mode from triggering
    if (isSelectionMode) return;
    
    const panel = document.getElementById(`smm-panel-${videoId}`);
    if (panel) {
        panel.classList.toggle('hidden');
    }
}

// Handles the API request and Render cold-start UX
async function submitSmmOrder(e, videoId, videoLink) {
    e.stopPropagation();
    
    // ADDED: Grab the provider value from the new dropdown
    const provider = document.getElementById(`smm-provider-${videoId}`).value;
    
    const service = document.getElementById(`smm-service-${videoId}`).value;
    const quantity = document.getElementById(`smm-quantity-${videoId}`).value;
    const btn = document.getElementById(`smm-send-btn-${videoId}`);

    if (!quantity || quantity <= 0) {
        showToast("Please enter a valid quantity", "error");
        return;
    }

    // 1. Instant UI Feedback (Solves the Render 45s delay risk)
    const originalText = btn.innerText;
    btn.innerText = "ORDERED...";
    btn.disabled = true;
    btn.classList.add('btn-loading');

    // 2. Format the Date (e.g., "20 - 11:12 AM")
    const now = new Date();
    const dateStr = now.getDate() + ' - ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    try {
        const response = await fetch(SMM_BACKEND_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                link: videoLink,
                service: service,
                quantity: quantity,
                provider: provider // This will now successfully send 'smmRaja' or 'smmPanelOne'
            })
        });

        if (response.ok) {
            showToast("Order placed successfully!", "success");
            
            // 3. Save the log to Firestore so it persists on reload
            await db.collection('videos').doc(videoId).update({
                lastSmmOrder: dateStr
            });
            
            // Note: The UI will automatically re-render via the Firestore onSnapshot listener, 
            // instantly updating the log text and resetting the panel state!
        } else {
            throw new Error("API returned an error");
        }
    } catch (error) {
        console.error(error);
        showToast("Failed to place order.", "error");
        
        // Only revert button if it fails. If it succeeds, the Firestore sync re-renders the row anyway.
        btn.innerText = originalText;
        btn.disabled = false;
        btn.classList.remove('btn-loading');
    }
}

// Syncs the Service dropdown so users can't pick Panel One with a Raja Service ID
function syncSmmDropdowns(videoId) {
    const provider = document.getElementById(`smm-provider-${videoId}`).value;
    const serviceSelect = document.getElementById(`smm-service-${videoId}`);
    
    const rajaGroup = serviceSelect.querySelector('optgroup[label="SMM Raja Services"]');
    const panelOneGroup = serviceSelect.querySelector('optgroup[label="SMM Panel One Services"]');
    
    if (provider === 'smmRaja') {
        rajaGroup.style.display = 'block';
        panelOneGroup.style.display = 'none';
        serviceSelect.value = "1224"; // Reset to Raja default (Views)
    } else {
        rajaGroup.style.display = 'none';
        panelOneGroup.style.display = 'block';
        serviceSelect.value = "8429"; // Reset to Panel One default (Views)
    }
}
