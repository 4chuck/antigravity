const API_URL = 'http://127.0.0.1:8000';

// ============================================
// DOM Elements
// ============================================
const dropArea = document.getElementById('dropArea');
const pdfUpload = document.getElementById('pdfUpload');
const uploadStatus = document.getElementById('uploadStatus');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const toolsSection = document.getElementById('toolsSection');
const toolBtns = document.querySelectorAll('.tool-btn');
const currentModeBadge = document.getElementById('currentModeBadge');
const modeDescription = document.getElementById('modeDescription');

const chatHistory = document.getElementById('chatHistory');
const chatForm = document.getElementById('chatForm');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');

const pdfUploadAdd = document.getElementById('pdfUploadAdd');
const sourceListContainer = document.getElementById('sourceListContainer');
const sourceList = document.getElementById('sourceList');
const notesContent = document.getElementById('notesContent');
const clearNotesBtn = document.getElementById('clearNotesBtn');
const generateAudioBtn = document.getElementById('generateAudioBtn');

// Responsive toggles
const sidebarToggle = document.getElementById('sidebarToggle');
const notesToggle = document.getElementById('notesToggle');
const sidebar = document.getElementById('sidebar');
const notesSidebar = document.getElementById('notesSidebar');

// ============================================
// State
// ============================================
let currentMode = 'qa';
let isProcessing = false;
let fileUploaded = false;
let uploadedFiles = [];
let notes = JSON.parse(localStorage.getItem('study_notes') || '[]');

const modeDescriptions = {
    qa: "Ask any question about the document.",
    quiz: "Enter a topic to generate a 5-question multiple choice quiz.",
    simplify: "Enter a complex topic to get a simplified explanation.",
    agent: "Give a multi-step task like 'summarize then extract key terms'."
};

const modeBadges = {
    qa: "Q&A",
    quiz: "Quiz",
    simplify: "Simplify",
    agent: "Agent"
};

const modePlaceholders = {
    qa: "Ask a question...",
    quiz: "e.g., 'Chapter 1' or 'Photosynthesis'",
    simplify: "What should I simplify?",
    agent: "Describe the task..."
};

// ============================================
// Event Listeners
// ============================================

// File Upload
pdfUpload.addEventListener('change', () => handleFileUpload(pdfUpload.files[0]));
pdfUploadAdd.addEventListener('change', () => handleFileUpload(pdfUploadAdd.files[0]));

// Notes
clearNotesBtn.addEventListener('click', () => {
    if (confirm("Clear all notes?")) {
        notes = [];
        saveNotes();
        renderNotes();
    }
});

// Audio Overview
generateAudioBtn.addEventListener('click', handleAudioOverview);

// Drag & Drop
dropArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropArea.classList.add('dragover');
});
dropArea.addEventListener('dragleave', () => {
    dropArea.classList.remove('dragover');
});
dropArea.addEventListener('drop', (e) => {
    e.preventDefault();
    dropArea.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFileUpload(e.dataTransfer.files[0]);
    }
});

// Tool Selection
toolBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        if (!fileUploaded) return;
        
        toolBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        currentMode = btn.dataset.mode;
        currentModeBadge.textContent = modeBadges[currentMode];
        modeDescription.textContent = modeDescriptions[currentMode];
        userInput.placeholder = modePlaceholders[currentMode];
        userInput.focus();
    });
});

// Chat Submit
chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!userInput.value.trim() || isProcessing || !fileUploaded) return;
    await processUserQuery(userInput.value.trim());
});

// Enter to submit
userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        chatForm.dispatchEvent(new Event('submit'));
    }
});

// Auto-resize textarea
userInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 160) + 'px';
    if (this.value.trim() === '') {
        this.style.height = '44px';
    }
});

// Responsive toggles
sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    notesSidebar.classList.remove('open');
});

notesToggle.addEventListener('click', () => {
    notesSidebar.classList.toggle('open');
    sidebar.classList.remove('open');
});

// Close sidebars on click outside (mobile)
document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 && !sidebar.contains(e.target) && !sidebarToggle.contains(e.target)) {
        sidebar.classList.remove('open');
    }
    if (window.innerWidth <= 1100 && !notesSidebar.contains(e.target) && !notesToggle.contains(e.target)) {
        notesSidebar.classList.remove('open');
    }
});

// ============================================
// File Upload
// ============================================
async function handleFileUpload(file) {
    if (!file || file.type !== 'application/pdf') {
        showToast("Please upload a valid PDF file.", "error");
        return;
    }

    const isFirstUpload = !fileUploaded;
    if (isFirstUpload) {
        dropArea.classList.add('hidden');
        uploadStatus.classList.remove('hidden');
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (response.ok) {
            uploadedFiles = result.files;

            if (isFirstUpload) {
                uploadStatus.classList.add('hidden');
                fileInfo.classList.remove('hidden');
                fileName.textContent = file.name;
                toolsSection.classList.remove('hidden');
                sourceListContainer.classList.remove('hidden');

                userInput.disabled = false;
                sendBtn.disabled = false;
                fileUploaded = true;
                appendBotMessage(`Great! I've processed **${file.name}**. You can now ask questions or add more documents.`);
            } else {
                appendBotMessage(`Added **${file.name}** to your knowledge base. I now have ${uploadedFiles.length} sources.`);
            }

            renderSourceList();
        } else {
            throw new Error(result.detail || "Upload failed");
        }
    } catch (error) {
        console.error(error);
        showToast(`Error: ${error.message}`, "error");
        if (isFirstUpload) {
            uploadStatus.classList.add('hidden');
            dropArea.classList.remove('hidden');
        }
    }
}

function renderSourceList() {
    sourceList.innerHTML = uploadedFiles.map(file => `
        <li class="source-item">
            <i class="fa-solid fa-file-pdf"></i>
            <span title="${file}">${file}</span>
        </li>
    `).join('');
}

// ============================================
// Query Processing
// ============================================
async function processUserQuery(query) {
    appendUserMessage(query);
    userInput.value = '';
    userInput.style.height = '44px';
    isProcessing = true;
    sendBtn.disabled = true;

    const loadingId = appendLoadingMessage();

    try {
        const response = await fetch(`${API_URL}/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, mode: currentMode })
        });

        const result = await response.json();
        removeLoadingMessage(loadingId);

        if (response.ok) {
            if (currentMode === 'quiz') {
                try {
                    let jsonStr = result.response.trim();
                    if (jsonStr.startsWith("```json")) {
                        jsonStr = jsonStr.replace(/```json/g, "").replace(/```/g, "").trim();
                    }
                    const quizData = JSON.parse(jsonStr);
                    renderInteractiveQuiz(quizData);
                } catch (e) {
                    console.error("Failed to parse quiz JSON", e);
                    appendBotMessage("Here is the generated quiz:\n\n" + result.response);
                }
            } else {
                appendBotWithCitations(result.response, result.sources);
            }
        } else {
            appendBotMessage(`Error: ${result.detail || 'Failed to process query'}`);
        }
    } catch (error) {
        removeLoadingMessage(loadingId);
        appendBotMessage(`Connection Error: Make sure the FastAPI backend is running.`);
    } finally {
        isProcessing = false;
        sendBtn.disabled = false;
        userInput.focus();
    }
}

// ============================================
// Message UI
// ============================================
function appendUserMessage(text) {
    const div = document.createElement('div');
    div.className = 'message user-message';
    div.innerHTML = `
        <div class="avatar">
            <i class="fa-solid fa-user"></i>
        </div>
        <div class="message-content">
            <div class="message-bubble"><p>${escapeHtml(text)}</p></div>
        </div>
    `;
    chatHistory.appendChild(div);
    scrollToBottom();
}

function appendBotMessage(text) {
    const div = document.createElement('div');
    div.className = 'message bot-message';
    const formattedText = typeof marked !== 'undefined' ? marked.parse(text) : `<p>${escapeHtml(text)}</p>`;
    div.innerHTML = `
        <div class="avatar bot-avatar">
            <i class="fa-solid fa-sparkles"></i>
        </div>
        <div class="message-content">
            <div class="message-bubble">${formattedText}</div>
        </div>
    `;
    chatHistory.appendChild(div);
    scrollToBottom();
}

function appendBotWithCitations(text, sources) {
    const div = document.createElement('div');
    div.className = 'message bot-message';

    const formattedText = typeof marked !== 'undefined' ? marked.parse(text) : `<p>${escapeHtml(text)}</p>`;

    let citationsHtml = '';
    if (sources && sources.length > 0) {
        citationsHtml = `
            <div class="citations-wrapper">
                <button class="citation-toggle" onclick="toggleCitations(this)">
                    <i class="fa-solid fa-chevron-down"></i> Show Sources (${sources.length})
                </button>
                <div class="sources-list hidden">
                    ${sources.map(s => `
                        <div class="source-snippet">
                            <span class="snippet-meta">Source: ${escapeHtml(s.metadata.source)} (Page ${s.metadata.page})</span>
                            <p>${escapeHtml(s.content)}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    div.innerHTML = `
        <div class="avatar bot-avatar">
            <i class="fa-solid fa-sparkles"></i>
        </div>
        <div class="message-content">
            <div class="message-bubble">${formattedText}</div>
            <div class="message-actions">
                <button class="action-btn" onclick="saveToNotes(this)">
                    <i class="fa-solid fa-bookmark"></i> Save to Notes
                </button>
            </div>
            ${citationsHtml}
        </div>
    `;
    chatHistory.appendChild(div);
    scrollToBottom();
}

function appendLoadingMessage() {
    const id = 'loading-' + Date.now();
    const div = document.createElement('div');
    div.className = 'message bot-message';
    div.id = id;
    div.innerHTML = `
        <div class="avatar bot-avatar">
            <i class="fa-solid fa-sparkles"></i>
        </div>
        <div class="message-content">
            <div class="loader">
                <div class="dot"></div><div class="dot"></div><div class="dot"></div>
            </div>
        </div>
    `;
    chatHistory.appendChild(div);
    scrollToBottom();
    return id;
}

function removeLoadingMessage(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

// ============================================
// Citations Toggle
// ============================================
window.toggleCitations = function (btn) {
    const list = btn.nextElementSibling;
    list.classList.toggle('hidden');
    if (list.classList.contains('hidden')) {
        btn.innerHTML = `<i class="fa-solid fa-chevron-down"></i> Show Sources`;
    } else {
        btn.innerHTML = `<i class="fa-solid fa-chevron-up"></i> Hide Sources`;
    }
};

// ============================================
// Notes
// ============================================
window.saveToNotes = function (btn) {
    const messageContent = btn.closest('.message-content');
    const text = messageContent.querySelector('.message-bubble').innerHTML;

    const note = {
        id: Date.now(),
        content: text,
        timestamp: new Date().toLocaleString()
    };

    notes.unshift(note);
    saveNotes();
    renderNotes();

    const originalHtml = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-check"></i> Saved!`;
    btn.style.borderColor = 'var(--accent-green)';
    btn.style.color = 'var(--accent-green)';
    setTimeout(() => {
        btn.innerHTML = originalHtml;
        btn.style.borderColor = '';
        btn.style.color = '';
    }, 2000);
};

function saveNotes() {
    localStorage.setItem('study_notes', JSON.stringify(notes));
}

function renderNotes() {
    if (notes.length === 0) {
        notesContent.innerHTML = `
            <div class="empty-notes">
                <div class="empty-icon">
                    <i class="fa-solid fa-note-sticky"></i>
                </div>
                <p>Your saved notes and summaries will appear here.</p>
            </div>
        `;
        return;
    }

    notesContent.innerHTML = notes.map(note => `
        <div class="note-card" data-id="${note.id}">
            <button class="delete-note" onclick="deleteNote(${note.id})"><i class="fa-solid fa-xmark"></i></button>
            <div class="note-body">${note.content}</div>
            <small style="color: var(--text-muted); font-size: 0.65rem; display: block; margin-top: 0.5rem;">${note.timestamp}</small>
        </div>
    `).join('');
}

window.deleteNote = function (id) {
    notes = notes.filter(n => n.id !== id);
    saveNotes();
    renderNotes();
};

renderNotes();

// ============================================
// Audio Overview
// ============================================
async function handleAudioOverview() {
    if (!fileUploaded) return;

    if (generateAudioBtn.classList.contains('playing')) {
        window.speechSynthesis.cancel();
        generateAudioBtn.classList.remove('playing');
        generateAudioBtn.innerHTML = `<i class="fa-solid fa-headphones"></i> Audio Overview`;
        return;
    }

    const originalContent = generateAudioBtn.innerHTML;
    generateAudioBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Generating...`;

    try {
        const response = await fetch(`${API_URL}/generate-audio-overview`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: "Generate a podcast script" })
        });

        const result = await response.json();

        if (response.ok) {
            playPodcast(result.script);
        } else {
            throw new Error(result.detail || "Failed to generate audio overview");
        }
    } catch (error) {
        showToast(error.message, "error");
        generateAudioBtn.innerHTML = originalContent;
    }
}

function playPodcast(script) {
    generateAudioBtn.classList.add('playing');
    generateAudioBtn.innerHTML = `<i class="fa-solid fa-stop"></i> Stop Audio`;

    const voices = window.speechSynthesis.getVoices();
    const voice1 = voices.find(v => v.name.includes('Google US English') || v.lang === 'en-US') || voices[0];
    const voice2 = voices.find(v => (v.name.includes('Female') || v.name.includes('Zira')) && v.lang === 'en-US') || voices[1] || voices[0];

    let currentIndex = 0;

    function speakNext() {
        if (currentIndex >= script.length || !generateAudioBtn.classList.contains('playing')) {
            generateAudioBtn.classList.remove('playing');
            generateAudioBtn.innerHTML = `<i class="fa-solid fa-headphones"></i> Audio Overview`;
            return;
        }

        const line = script[currentIndex];
        const utterance = new SpeechSynthesisUtterance(line.text);

        if (line.speaker === 'Host') {
            utterance.voice = voice1;
            utterance.pitch = 1.1;
            utterance.rate = 1.0;
        } else {
            utterance.voice = voice2;
            utterance.pitch = 0.9;
            utterance.rate = 0.95;
        }

        utterance.onend = () => {
            currentIndex++;
            speakNext();
        };

        window.speechSynthesis.speak(utterance);
    }

    speakNext();
}

// ============================================
// Interactive Quiz
// ============================================
function renderInteractiveQuiz(quizData) {
    const div = document.createElement('div');
    div.className = 'message bot-message';

    let quizHtml = `
        <div class="avatar bot-avatar"><i class="fa-solid fa-sparkles"></i></div>
        <div class="message-content">
            <div class="message-bubble quiz-container">
                <h3><i class="fa-solid fa-list-check"></i> Interactive Quiz</h3>
                <div id="quizQuestions">
    `;

    quizData.forEach((q, qIndex) => {
        quizHtml += `
            <div class="quiz-question" data-answer="${q.answer_index}">
                <p><strong>Q${qIndex + 1}: ${escapeHtml(q.question)}</strong></p>
                <div class="quiz-options">
        `;
        q.options.forEach((opt, oIndex) => {
            quizHtml += `<button class="quiz-option" onclick="selectQuizOption(this, ${qIndex}, ${oIndex})"><span class="opt-label">${String.fromCharCode(65 + oIndex)}</span> ${escapeHtml(opt)}</button>`;
        });
        quizHtml += `</div></div>`;
    });

    quizHtml += `
                </div>
                <button class="quiz-submit-btn" onclick="submitQuiz(this, ${quizData.length})">
                    <i class="fa-solid fa-check-double"></i> Submit Answers
                </button>
                <div class="quiz-result hidden"></div>
            </div>
        </div>
    `;

    div.innerHTML = quizHtml;
    chatHistory.appendChild(div);
    scrollToBottom();
}

window.selectQuizOption = function (btn, qIndex, oIndex) {
    const optionsContainer = btn.parentElement;
    Array.from(optionsContainer.children).forEach(child => child.classList.remove('selected'));
    btn.classList.add('selected');
    optionsContainer.dataset.answered = oIndex;
};

window.submitQuiz = function (submitBtn, totalQuestions) {
    const container = submitBtn.parentElement;
    const questions = container.querySelectorAll('.quiz-question');
    let score = 0;
    let allAnswered = true;

    questions.forEach(q => {
        const optionsContainer = q.querySelector('.quiz-options');
        if (optionsContainer.dataset.answered === undefined) {
            allAnswered = false;
        }
    });

    if (!allAnswered) {
        showToast("Please answer all questions before submitting.", "warning");
        return;
    }

    questions.forEach(q => {
        const correctIndex = parseInt(q.dataset.answer);
        const optionsContainer = q.querySelector('.quiz-options');
        const options = optionsContainer.querySelectorAll('.quiz-option');
        const answeredIndex = parseInt(optionsContainer.dataset.answered);

        options.forEach((opt, idx) => {
            opt.disabled = true;
            if (idx === correctIndex) {
                opt.classList.add('correct');
            } else if (idx === answeredIndex && answeredIndex !== correctIndex) {
                opt.classList.add('wrong');
            }
        });

        if (answeredIndex === correctIndex) {
            score++;
        }
    });

    submitBtn.classList.add('hidden');
    const resultDiv = container.querySelector('.quiz-result');
    resultDiv.classList.remove('hidden');

    const emoji = score === totalQuestions ? '🎉' : score >= totalQuestions / 2 ? '👍' : '📚';
    const color = score === totalQuestions ? 'var(--accent-green)' : 'var(--accent-purple)';
    resultDiv.innerHTML = `<h4 style="color: ${color}; font-size: 1.1rem;">${emoji} You scored ${score} out of ${totalQuestions}!</h4>`;
};

// ============================================
// Utility Functions
// ============================================
function scrollToBottom() {
    requestAnimationFrame(() => {
        chatHistory.scrollTop = chatHistory.scrollHeight;
    });
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Simple toast notification
function showToast(message, type = "info") {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%) translateY(20px);
        padding: 0.65rem 1.25rem;
        border-radius: 12px;
        font-size: 0.82rem;
        font-weight: 500;
        color: white;
        z-index: 10000;
        opacity: 0;
        transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
        backdrop-filter: blur(12px);
        font-family: 'Inter', sans-serif;
        box-shadow: 0 8px 30px rgba(0,0,0,0.4);
    `;

    if (type === "error") {
        toast.style.background = 'rgba(239, 68, 68, 0.85)';
    } else if (type === "warning") {
        toast.style.background = 'rgba(245, 158, 11, 0.85)';
    } else {
        toast.style.background = 'rgba(99, 102, 241, 0.85)';
    }

    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
    });

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(20px)';
        setTimeout(() => toast.remove(), 350);
    }, 3500);
}
