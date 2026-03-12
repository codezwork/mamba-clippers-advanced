const SMM_BACKEND_URL = "https://mamba-clippers-backend-smm.onrender.com/api/test-smm";

function toggleSmmPanel(e, videoId) {
    e.stopPropagation(); 
    if (isSelectionMode) return;
    
    const panel = document.getElementById(`smm-panel-${videoId}`);
    if (panel) {
        panel.classList.toggle('hidden');
    }
}

// Controls the Provider Toggle
function setSmmProvider(e, videoId, provider) {
    e.stopPropagation();
    const panel = document.getElementById(`smm-panel-${videoId}`);
    panel.dataset.provider = provider; // Save state to DOM

    // Reset styles
    document.getElementById(`prov-raja-${videoId}`).classList.remove('active');
    document.getElementById(`prov-one-${videoId}`).classList.remove('active');

    // Add active style to selected
    if (provider === 'smmRaja') {
        document.getElementById(`prov-raja-${videoId}`).classList.add('active');
    } else {
        document.getElementById(`prov-one-${videoId}`).classList.add('active');
    }
}

// Controls the Service Mode Toggle
function setSmmMode(e, videoId, mode) {
    e.stopPropagation();
    const panel = document.getElementById(`smm-panel-${videoId}`);
    panel.dataset.mode = mode; // Save state to DOM

    // Reset Icon Toggles
    document.getElementById(`mode-views-${videoId}`).classList.remove('active');
    document.getElementById(`mode-likes-${videoId}`).classList.remove('active');

    // Hide both quantity groups
    document.getElementById(`quantities-views-${videoId}`).classList.add('hidden');
    document.getElementById(`quantities-likes-${videoId}`).classList.add('hidden');

    // Activate the right ones
    if (mode === 'views') {
        document.getElementById(`mode-views-${videoId}`).classList.add('active');
        document.getElementById(`quantities-views-${videoId}`).classList.remove('hidden');
    } else {
        document.getElementById(`mode-likes-${videoId}`).classList.add('active');
        document.getElementById(`quantities-likes-${videoId}`).classList.remove('hidden');
    }
}

// NEW: Connects the Custom Qty Input seamlessly to our main submit function
async function submitCustomSmm(e, videoId, videoLink, btnElement) {
    e.stopPropagation();
    
    const inputEl = document.getElementById(`custom-qty-${videoId}`);
    const quantity = parseInt(inputEl.value);
    
    if (!quantity || quantity <= 0) {
        showToast("Enter a valid quantity", "error");
        return;
    }
    
    // Process it through our existing order submission
    await submitSmmOrder(e, videoId, videoLink, quantity, btnElement);
    
    // Clear input after submission
    inputEl.value = '';
}


// Handles the Order Submission based on toggled states
async function submitSmmOrder(e, videoId, videoLink, quantity, btnElement) {
    e.stopPropagation();
    
    // Read current state from the panel
    const panel = document.getElementById(`smm-panel-${videoId}`);
    const provider = panel.dataset.provider;
    const mode = panel.dataset.mode;
    
    let serviceId = '';
    let serviceName = '';

    // Map the IDs based on provider and mode combinations
    if (provider === 'smmRaja' && mode === 'views') { serviceId = '1224'; serviceName = 'Views (R)'; }
    if (provider === 'smmRaja' && mode === 'likes') { serviceId = '2150'; serviceName = 'Likes (R)'; }
    if (provider === 'smmPanelOne' && mode === 'views') { serviceId = '8429'; serviceName = 'Views (O)'; }
    if (provider === 'smmPanelOne' && mode === 'likes') { serviceId = '12981'; serviceName = 'Likes (O)'; }

    // Instant UI Feedback (Now supports both Text Buttons and SVG Arrow buttons)
    const originalContent = btnElement.innerHTML;
    
    if (btnElement.innerText.trim()) {
        btnElement.innerText = "ORDERING...";
    } else {
        // If it's an icon button, use a spinner symbol temporarily
        btnElement.innerHTML = "⏳";
    }
    
    btnElement.disabled = true;
    btnElement.classList.add('btn-loading');

    const now = new Date();
    const dateStr = now.getDate() + ' - ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const fullLogDetails = `${dateStr} (${quantity} ${serviceName})`;

    try {
        const response = await fetch(SMM_BACKEND_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                link: videoLink,
                service: serviceId,
                quantity: quantity,
                provider: provider 
            })
        });

        if (response.ok) {
            showToast("Order placed successfully!", "success");
            
            await db.collection('videos').doc(videoId).update({
                lastSmmOrder: fullLogDetails
            });
            
            // Update the log text immediately on screen
            document.getElementById(`smm-log-${videoId}`).innerText = `Last: ${fullLogDetails}`;
            
        } else {
            throw new Error("API returned an error");
        }
    } catch (error) {
        console.error(error);
        showToast("Failed to place order.", "error");
    } finally {
        // Always revert the button back so it can be clicked again
        btnElement.innerHTML = originalContent;
        btnElement.disabled = false;
        btnElement.classList.remove('btn-loading');
    }
}