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

// Controls the Execution Mode Toggle (Auto vs Manual)
function setSmmExecMode(e, videoId, exec) {
    e.stopPropagation();
    const panel = document.getElementById(`smm-panel-${videoId}`);
    panel.dataset.exec = exec;

    // Switch Icon Styles
    document.getElementById(`exec-auto-${videoId}`).classList.toggle('active', exec === 'auto');
    document.getElementById(`exec-manual-${videoId}`).classList.toggle('active', exec === 'manual');

    // Read current service mode to know which grid to reveal
    const mode = panel.dataset.mode; 

    // Hide all grids initially
    document.getElementById(`quantities-views-auto-${videoId}`).classList.add('hidden');
    document.getElementById(`quantities-likes-auto-${videoId}`).classList.add('hidden');
    document.getElementById(`quantities-views-manual-${videoId}`).classList.add('hidden');
    document.getElementById(`quantities-likes-manual-${videoId}`).classList.add('hidden');
    
    // Toggle custom input container (Only in Manual)
    const customContainer = document.getElementById(`custom-qty-container-${videoId}`);
    if (exec === 'manual') customContainer.classList.remove('hidden');
    else customContainer.classList.add('hidden');

    // Show the active grid based on current states
    document.getElementById(`quantities-${mode}-${exec}-${videoId}`).classList.remove('hidden');
}

// Controls the Service Mode Toggle (Upgraded to respect Execution Mode)
function setSmmMode(e, videoId, mode) {
    e.stopPropagation();
    const panel = document.getElementById(`smm-panel-${videoId}`);
    panel.dataset.mode = mode; 
    const exec = panel.dataset.exec; 

    document.getElementById(`mode-views-${videoId}`).classList.remove('active');
    document.getElementById(`mode-likes-${videoId}`).classList.remove('active');

    // Hide all grids
    document.getElementById(`quantities-views-auto-${videoId}`).classList.add('hidden');
    document.getElementById(`quantities-likes-auto-${videoId}`).classList.add('hidden');
    document.getElementById(`quantities-views-manual-${videoId}`).classList.add('hidden');
    document.getElementById(`quantities-likes-manual-${videoId}`).classList.add('hidden');

    // Activate right toggle & grid
    if (mode === 'views') {
        document.getElementById(`mode-views-${videoId}`).classList.add('active');
        document.getElementById(`quantities-views-${exec}-${videoId}`).classList.remove('hidden');
    } else {
        document.getElementById(`mode-likes-${videoId}`).classList.add('active');
        document.getElementById(`quantities-likes-${exec}-${videoId}`).classList.remove('hidden');
    }
}

// UPDATED: Dynamic 24H Automation Protocol
async function fireAutomation(e, videoId, videoLink, totalQuantity, btnElement) {
    e.stopPropagation();

    // Read exact state to route the order perfectly
    const panel = document.getElementById(`smm-panel-${videoId}`);
    const provider = panel.dataset.provider;
    const mode = panel.dataset.mode;
    
    let serviceId = '';
    let serviceName = '';

    if (provider === 'smmRaja' && mode === 'views') { serviceId = '7235'; serviceName = 'Views (R)'; }
    if (provider === 'smmRaja' && mode === 'likes') { serviceId = '2150'; serviceName = 'Likes (R)'; }
    if (provider === 'smmPanelOne' && mode === 'views') { serviceId = '17354'; serviceName = 'Views (O)'; }
    if (provider === 'smmPanelOne' && mode === 'likes') { serviceId = '12981'; serviceName = 'Likes (O)'; }

    // Dynamic Safeguard Warning
    if (!confirm(`Initiate 24H Automation?\n\nThis will send ${totalQuantity} ${serviceName} (in 4 intervals of 6 hours).\n\nThis will lock the auto buttons for 24 hours.`)) {
        return; 
    }
    
    // Dynamic Payload
    const payload = {
        link: videoLink,
        service: serviceId,
        quantity: totalQuantity,
        runs: 4,            
        interval: 360,      
        provider: provider
    };

    const originalContent = btnElement.innerHTML;
    btnElement.innerHTML = "⏳";
    btnElement.disabled = true;
    btnElement.classList.add('btn-loading');

    try {
        const response = await fetch(SMM_BACKEND_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok && !data.error) {
            showToast("Automation active for 24 Hours!", "success");
            
            const now = new Date();
            const dateStr = now.getDate() + ' - ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            const fullLogDetails = `${dateStr} (AUTO 24H: ${totalQuantity} ${serviceName})`;
            
            // DYNAMIC TIMESTAMP SELECTION
            // Checks the current mode and writes to the correct database field
            const timestampField = mode === 'views' ? 'lastAutoViewsAt' : 'lastAutoLikesAt';
            
            await db.collection('videos').doc(videoId).update({
                [timestampField]: firebase.firestore.FieldValue.serverTimestamp(),
                lastSmmOrder: fullLogDetails
            });
            
        } else {
            showToast(`API Rejected: ${data.error || 'Unknown Error'}`, "error");
            btnElement.innerHTML = originalContent;
            btnElement.disabled = false;
        }
    } catch (error) {
        console.error(error);
        showToast("Network Error: Could not reach backend", "error");
        btnElement.innerHTML = originalContent;
        btnElement.disabled = false;
    } finally {
        btnElement.classList.remove('btn-loading');
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
    if (provider === 'smmRaja' && mode === 'views') { serviceId = '7235'; serviceName = 'Views (R)'; }
    if (provider === 'smmRaja' && mode === 'likes') { serviceId = '2150'; serviceName = 'Likes (R)'; }
    if (provider === 'smmPanelOne' && mode === 'views') { serviceId = '17354'; serviceName = 'Views (O)'; }
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
