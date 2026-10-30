const { ipcRenderer } = require('electron');

let isVoiceActive = false;
let recognition = null;

// Securely fetch API key from localStorage or prompt if missing
function getApiKey() {
    let key = localStorage.getItem('slsi_api_key');
    if (!key) {
        key = prompt("Please enter your Gemini API Key for S.L.S.I.:");
        if (key) {
            localStorage.setItem('slsi_api_key', key.trim());
        }
    }
    return key;
}

// Voice Recognition Setup
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        document.getElementById('userInput').value = transcript;
        window.sendMessage();
    };

    recognition.onerror = (event) => {
        console.error("Speech Recognition Error:", event.error);
        if (isVoiceActive) recognition.start();
    };

    recognition.onend = () => {
        if (isVoiceActive) recognition.start();
    };
}

window.toggleVoiceMode = function() {
    if (!recognition) {
        alert("Speech recognition is not supported on this environment.");
        return;
    }

    const micBtn = document.getElementById('micBtn');
    const voiceStatus = document.getElementById('voiceStatus');

    isVoiceActive = !isVoiceActive;

    if (isVoiceActive) {
        micBtn.classList.add('active');
        if (voiceStatus) voiceStatus.textContent = "LISTENING";
        speakText("Voice mode activated. Listening.");
        recognition.start();
    } else {
        micBtn.classList.remove('active');
        if (voiceStatus) voiceStatus.textContent = "OFF";
        recognition.stop();
        window.speechSynthesis.cancel();
        speakText("Voice mode deactivated.");
    }
};

function speakText(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const cleanSpeech = text.replace(/```[\s\S]*?```/g, 'Code output generated.').replace(/[^a-zA-Z0-9.,?! ]/g, '');
        const utterance = new SpeechSynthesisUtterance(cleanSpeech);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
    }
}

window.sendMessage = async function() {
    const apiKey = getApiKey();
    if (!apiKey) {
        alert("API Key is required to run S.L.S.I.");
        return;
    }

    const input = document.getElementById('userInput');
    const chatBox = document.getElementById('chatBox');
    const text = input.value.trim();
    if (!text) return;

    // Display User Message
    const userMsg = document.createElement('div');
    userMsg.className = 'message user';
    userMsg.textContent = text;
    chatBox.appendChild(userMsg);
    input.value = '';
    chatBox.scrollTop = chatBox.scrollHeight;

    // AI Message Placeholder
    const aiMsg = document.createElement('div');
    aiMsg.className = 'message ai';
    aiMsg.textContent = 'Thinking...';
    chatBox.appendChild(aiMsg);
    chatBox.scrollTop = chatBox.scrollHeight;

    const lowerText = text.toLowerCase();

    // 1. Universal Code Generation & Notepad Typing Task
    if (lowerText.includes('notepad') && (lowerText.includes('code') || lowerText.includes('type') || lowerText.includes('write') || lowerText.includes('script'))) {
        aiMsg.textContent = "Analyzing request, generating code, and opening Notepad...";
        
        try {
            const aiPrompt = `Generate clean, standalone, complete source code based on this request: "${text}". Output ONLY raw source code without markdown or explanatory text.`;
            let generatedCode = await callGeminiAPI(aiPrompt, apiKey);
            generatedCode = generatedCode.replace(/```[\w-]*\n?/g, '').replace(/```/g, '').trim();

            const result = await ipcRenderer.invoke('open-notepad-and-type', generatedCode);
            aiMsg.textContent = `${result.output}\n\nGenerated Code Preview:\n${generatedCode.substring(0, 150)}...`;
            if (isVoiceActive) speakText("Code generated and pasted into Notepad.");
        } catch (err) {
            aiMsg.textContent = `Task Error: ${err.message}`;
            if (isVoiceActive) speakText("Task failed.");
        }
    }
    // 2. App Launching
    else if (lowerText.startsWith('open ') || lowerText.startsWith('launch ') || lowerText.startsWith('start ')) {
        const appName = text.replace(/^(open|launch|start)\s+/i, '').trim();
        aiMsg.textContent = `Launching ${appName}...`;

        const result = await ipcRenderer.invoke('open-app', appName);
        aiMsg.textContent = result.output;
        if (isVoiceActive) speakText(result.output);
    } 
    // 3. Direct Terminal Execution
    else if (text.startsWith('cmd:') || text.startsWith('run:')) {
        const command = text.replace(/^(cmd:|run:)/, '').trim();
        aiMsg.textContent = `Executing command: "${command}"...`;
        
        const result = await ipcRenderer.invoke('run-terminal', command);
        aiMsg.textContent = result.success ? `[Terminal Output]\n${result.output}` : `[Error]\n${result.output}`;
        if (isVoiceActive) speakText("Command executed.");
    } 
    // 4. Standard AI Conversation
    else {
        try {
            const aiResponse = await callGeminiAPI(text, apiKey);
            aiMsg.textContent = aiResponse;
            if (isVoiceActive) speakText(aiResponse);
        } catch (err) {
            aiMsg.textContent = `Connection Error: ${err.message}`;
            if (isVoiceActive) speakText("Connection error.");
        }
    }
    chatBox.scrollTop = chatBox.scrollHeight;
};

// Gemini API Call using dynamic key
async function callGeminiAPI(promptText, apiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }]
            })
        });
        clearTimeout(timeoutId);

        const data = await response.json();
        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
            return data.candidates[0].content.parts[0].text;
        } else if (data.error) {
            return `API Error: ${data.error.message}`;
        } else {
            return "Unable to process request.";
        }
    } catch (error) {
        clearTimeout(timeoutId);
        return `Fetch Error: ${error.message}`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('userInput');
    if (input) {
        input.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') window.sendMessage();
        });
    }
});