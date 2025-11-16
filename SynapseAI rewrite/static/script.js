// State
let isInjected = false;

// DOM Elements
const scriptEditor = document.getElementById('script-editor');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const injectBtn = document.getElementById('inject-btn');
const executeBtn = document.getElementById('execute-btn');
const clearBtn = document.getElementById('clear-btn');
const saveBtn = document.getElementById('save-btn');
const loadBtn = document.getElementById('load-btn');
const hubBtn = document.getElementById('hub-btn');
const lineCount = document.getElementById('line-count');
const charCount = document.getElementById('char-count');

// Modals
const hubModal = document.getElementById('hub-modal');
const saveModal = document.getElementById('save-modal');
const scriptsContainer = document.getElementById('scripts-container');
const notificationContainer = document.getElementById('notification-container');

// Close buttons
const closeHubBtn = document.querySelector('.close');
const closeSaveBtn = document.querySelector('.close-save');
const saveCancelBtn = document.getElementById('save-cancel-btn');
const saveConfirmBtn = document.getElementById('save-confirm-btn');

// Initialize
updateEditorStats();
checkStatus();

// Event Listeners
scriptEditor.addEventListener('input', updateEditorStats);
injectBtn.addEventListener('click', inject);
executeBtn.addEventListener('click', executeScript);
clearBtn.addEventListener('click', clearEditor);
saveBtn.addEventListener('click', showSaveModal);
loadBtn.addEventListener('click', loadFromFile);
hubBtn.addEventListener('click', showScriptHub);
closeHubBtn.addEventListener('click', () => hideModal(hubModal));
closeSaveBtn.addEventListener('click', () => hideModal(saveModal));
saveCancelBtn.addEventListener('click', () => hideModal(saveModal));
saveConfirmBtn.addEventListener('click', saveToHub);

// Close modal on outside click
window.addEventListener('click', (e) => {
    if (e.target === hubModal) hideModal(hubModal);
    if (e.target === saveModal) hideModal(saveModal);
});

// Functions
function updateEditorStats() {
    const text = scriptEditor.value;
    const lines = text.split('\n').length;
    const chars = text.length;
    
    lineCount.textContent = `Lines: ${lines}`;
    charCount.textContent = `Characters: ${chars}`;
}

async function checkStatus() {
    try {
        const response = await fetch('/api/status');
        const data = await response.json();
        
        isInjected = data.injected;
        updateUI();
    } catch (error) {
        console.error('Status check failed:', error);
    }
}

function updateUI() {
    if (isInjected) {
        statusDot.classList.add('active');
        statusText.textContent = 'Injected ✓';
        injectBtn.disabled = true;
        injectBtn.textContent = 'Injected';
        executeBtn.disabled = false;
    } else {
        statusDot.classList.remove('active');
        statusText.textContent = 'Not Injected';
        injectBtn.disabled = false;
        injectBtn.textContent = 'Inject';
        executeBtn.disabled = true;
    }
}

async function inject() {
    injectBtn.classList.add('loading');
    injectBtn.disabled = true;
    
    try {
        const response = await fetch('/api/inject', {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            showNotification('Success', data.message, 'success');
            isInjected = true;
            updateUI();
        } else {
            showNotification('Error', data.message, 'error');
        }
    } catch (error) {
        showNotification('Error', 'Failed to inject: ' + error.message, 'error');
    } finally {
        injectBtn.classList.remove('loading');
        if (!isInjected) injectBtn.disabled = false;
    }
}

async function executeScript() {
    const script = scriptEditor.value.trim();
    
    if (!script) {
        showNotification('Warning', 'Script is empty!', 'warning');
        return;
    }
    
    if (!isInjected) {
        showNotification('Warning', 'Please inject first!', 'warning');
        return;
    }
    
    executeBtn.classList.add('loading');
    executeBtn.disabled = true;
    
    try {
        const response = await fetch('/api/execute', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ script })
        });
        const data = await response.json();
        
        if (data.success) {
            showNotification('Success', 'Script executed successfully!', 'success');
        } else {
            showNotification('Error', data.message, 'error');
        }
    } catch (error) {
        showNotification('Error', 'Execution failed: ' + error.message, 'error');
    } finally {
        executeBtn.classList.remove('loading');
        executeBtn.disabled = false;
    }
}

function clearEditor() {
    if (scriptEditor.value.trim() && !confirm('Are you sure you want to clear the editor?')) {
        return;
    }
    scriptEditor.value = '';
    updateEditorStats();
    showNotification('Info', 'Editor cleared', 'info');
}

function showSaveModal() {
    saveModal.classList.add('show');
    document.getElementById('script-name').value = '';
    document.getElementById('script-description').value = '';
}

async function saveToHub() {
    const name = document.getElementById('script-name').value.trim();
    const description = document.getElementById('script-description').value.trim();
    const content = scriptEditor.value.trim();
    
    if (!name) {
        showNotification('Warning', 'Please enter a script name', 'warning');
        return;
    }
    
    if (!content) {
        showNotification('Warning', 'Script is empty!', 'warning');
        return;
    }
    
    saveConfirmBtn.classList.add('loading');
    saveConfirmBtn.disabled = true;
    
    try {
        const response = await fetch('/api/scripts/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, description, content })
        });
        const data = await response.json();
        
        if (data.success) {
            showNotification('Success', data.message, 'success');
            hideModal(saveModal);
        } else {
            showNotification('Error', data.message, 'error');
        }
    } catch (error) {
        showNotification('Error', 'Save failed: ' + error.message, 'error');
    } finally {
        saveConfirmBtn.classList.remove('loading');
        saveConfirmBtn.disabled = false;
    }
}

function loadFromFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.lua,.txt';
    
    input.onchange = (e) => {
        const file = e.target.files[0];
        const reader = new FileReader();
        
        reader.onload = (event) => {
            scriptEditor.value = event.target.result;
            updateEditorStats();
            showNotification('Success', `Loaded ${file.name}`, 'success');
        };
        
        reader.onerror = () => {
            showNotification('Error', 'Failed to read file', 'error');
        };
        
        reader.readAsText(file);
    };
    
    input.click();
}

async function showScriptHub() {
    hubModal.classList.add('show');
    scriptsContainer.innerHTML = '<p style="text-align: center; color: #888;">Loading scripts...</p>';
    
    try {
        const response = await fetch('/api/scripts');
        const scripts = await response.json();
        
        if (Object.keys(scripts).length === 0) {
            scriptsContainer.innerHTML = '<p style="text-align: center; color: #888;">No scripts available. Save some scripts to see them here!</p>';
            return;
        }
        
        scriptsContainer.innerHTML = '';
        
        for (const [name, data] of Object.entries(scripts)) {
            const card = document.createElement('div');
            card.className = 'script-card';
            
            card.innerHTML = `
                <h3>${name}</h3>
                <p>${data.description || 'No description'}</p>
                <div class="script-card-buttons">
                    <button class="btn btn-primary" onclick="loadScript('${name}')">Load Script</button>
                </div>
            `;
            
            scriptsContainer.appendChild(card);
        }
    } catch (error) {
        scriptsContainer.innerHTML = '<p style="text-align: center; color: #e74c3c;">Failed to load scripts</p>';
        console.error('Failed to load scripts:', error);
    }
}

async function loadScript(name) {
    try {
        const response = await fetch('/api/scripts');
        const scripts = await response.json();
        
        if (scripts[name]) {
            scriptEditor.value = scripts[name].content;
            updateEditorStats();
            hideModal(hubModal);
            showNotification('Success', `Loaded ${name}`, 'success');
        }
    } catch (error) {
        showNotification('Error', 'Failed to load script', 'error');
    }
}

function hideModal(modal) {
    modal.classList.remove('show');
}

function showNotification(title, message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    notification.innerHTML = `
        <div class="notification-title">${title}</div>
        <div class="notification-message">${message}</div>
    `;
    
    notificationContainer.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Download functionality
function downloadScript() {
    const script = scriptEditor.value;
    const blob = new Blob([script], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'script.lua';
    a.click();
    URL.revokeObjectURL(url);
    showNotification('Success', 'Script downloaded', 'success');
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Enter to execute
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!executeBtn.disabled) {
            executeScript();
        }
    }
    
    // Ctrl/Cmd + S to save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        showSaveModal();
    }
    
    // Ctrl/Cmd + O to load
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        loadFromFile();
    }
});

// Check status periodically
setInterval(checkStatus, 5000);
