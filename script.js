import { GoogleGenerativeAI } from "@google/generative-ai";

// 確保 pdf.js 的 worker 路徑
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js`;
}

// --- 核心設定：SDK 候補名單 ---
const MODEL_FALLBACKS = [
    'gemini-1.5-flash', 
    'gemini-2.0-flash-exp',
    'gemini-1.5-pro'
];

const CONFIG = {
    API_BATCH_SIZE: 8,
    DEBOUNCE_DELAY: 800,
    MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024,
};

// --- DOM 元素選取 ---
const textInput = document.getElementById('text-input');
const fileInput = document.getElementById('file-input');
const fileNameDisplay = document.getElementById('file-name-display');
const imageInput = document.getElementById('image-input');
const imagePreviewContainer = document.getElementById('image-preview-container');
const numQuestionsInput = document.getElementById('num-questions');
const questionTypeSelect = document.getElementById('question-type-select');
const difficultySelect = document.getElementById('difficulty-select');
const questionStyleSelect = document.getElementById('question-style-select');
const topicInput = document.getElementById('topic-input');
const studentLevelSelect = document.getElementById('student-level-select');
const competencyBasedCheckbox = document.getElementById('competency-based-checkbox');
const previewLoader = document.getElementById('preview-loader');
const loadingText = document.getElementById('loading-text');
const questionsContainer = document.getElementById('questions-container');
const previewPlaceholder = document.getElementById('preview-placeholder');
const previewActions = document.getElementById('preview-actions');
const regenerateBtn = document.getElementById('regenerate-btn');
const downloadBtn = document.getElementById('download-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsPopover = document.getElementById('settings-popover');
const apiKeyInput = document.getElementById('api-key-input');
const saveApiKeyBtn = document.getElementById('save-api-key-btn');
const clearApiKeyBtn = document.getElementById('clear-api-key-btn');
const autoGenerateToggle = document.getElementById('auto-generate-toggle');
const mainContainer = document.getElementById('main-container');

// --- 全域狀態 ---
let generatedQuestions = [];
let uploadedImages = [];
let sortableInstance = null;

// --- 核心功能函式 ---
function getApiKey() { return localStorage.getItem('gemini_api_key'); }

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-message');
    toastMsg.textContent = message;
    toast.className = `fixed bottom-5 right-5 text-white py-2 px-5 rounded-lg shadow-xl transition-opacity duration-300 ${type === 'success' ? 'bg-green-500' : 'bg-red-500'} z-50 opacity-100`;
    setTimeout(() => { toast.classList.add('opacity-0'); }, 3000);
}

// --- SDK 呼叫核心 ---
async function fetchFromGemini(apiKey, payload) {
    const genAI = new GoogleGenerativeAI(apiKey);
    let lastError = null;

    for (const modelName of MODEL_FALLBACKS) {
        if (loadingText) loadingText.textContent = `嘗試連線模型: ${modelName}...`;
        try {
            const model = genAI.getGenerativeModel({ 
                model: modelName,
                generationConfig: payload.generationConfig 
            });

            const result = await model.generateContent({
                contents: payload.contents,
                systemInstruction: payload.systemInstruction
            });

            const response = await result.response;
            return response.text();
        } catch (error) {
            console.warn(`模型 ${modelName} 失敗:`, error.message);
            lastError = error;
        }
    }
    throw new Error(`所有模型皆無法使用。(${lastError?.message})`);
}

// --- 題目生成邏輯 (SDK 版) ---
async function triggerQuestionGeneration() {
    const apiKey = getApiKey();
    if (!apiKey) return showToast('請先設定 API Key！', 'error');

    const text = textInput.value.trim();
    if (!text && uploadedImages.length === 0) return;

    previewLoader.classList.remove('hidden');
    previewPlaceholder?.classList.add('hidden');
    previewActions.classList.add('hidden');

    try {
        const num = parseInt(numQuestionsInput.value);
        const type = questionTypeSelect.value;
        const diff = difficultySelect.value;
        const style = questionStyleSelect.value;

        const systemPrompt = `你是一位專業出題老師。根據教材生成 ${num} 題${diff}難度的${type === 'true_false' ? '是非題' : '選擇題'}。
        格式要求：嚴格回傳 JSON 陣列。
        若是選擇題，欄位包含：text, options, correct (索引陣列)。
        若是是非題，欄位包含：text, is_correct (布林值)。
        ${style === 'competency-based' ? '需額外包含 design_concept 欄位說明素養導向設計理念。' : ''}
        語言：繁體中文。`;

        const contentParts = [{ text: `教材內容：\n${text}` }];
        uploadedImages.forEach(img => contentParts.push({ inlineData: { mimeType: img.type, data: img.data } }));

        const payload = {
            contents: [{ role: "user", parts: contentParts }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: { responseMimeType: "application/json" }
        };

        const jsonRes = await fetchFromGemini(apiKey, payload);
        generatedQuestions = JSON.parse(jsonRes.replace(/```json|```/g, '').trim());
        
        renderQuestionsForEditing(generatedQuestions);
        initializeSortable();
        previewActions.classList.remove('hidden');
        showToast('題目生成成功！');
    } catch (error) {
        console.error(error);
        showToast(error.message, 'error');
    } finally {
        previewLoader.classList.add('hidden');
    }
}

// --- AI 自動撰寫教材功能 ---
async function generateContentFromTopic() {
    const apiKey = getApiKey();
    if (!apiKey) return showToast('請設定 API Key！', 'error');
    const topic = topicInput.value.trim();
    if (!topic) return showToast('請輸入主題！', 'error');

    previewLoader.classList.remove('hidden');
    try {
        const level = studentLevelSelect.options[studentLevelSelect.selectedIndex].text;
        const systemPrompt = `你是一位教材設計師。請針對「${topic}」為「${level}」學生寫一篇教材。`;
        const payload = {
            contents: [{ role: "user", parts: [{ text: `主題：${topic}` }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] }
        };
        const resText = await fetchFromGemini(apiKey, payload);
        textInput.value = resText;
        showToast('教材生成完成！');
        if (autoGenerateToggle.checked) triggerQuestionGeneration();
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        previewLoader.classList.add('hidden');
    }
}

// --- UI 渲染與編輯功能 ---
function renderQuestionsForEditing(questions) {
    questionsContainer.innerHTML = '';
    questions.forEach((q, index) => {
        const isTF = q.hasOwnProperty('is_correct');
        const card = document.createElement('div');
        card.className = 'bg-gray-50 p-4 rounded-lg border shadow-sm flex gap-x-3 mb-4';
        card.innerHTML = `
            <div class="drag-handle cursor-grab text-gray-400">☰</div>
            <div class="flex-grow">
                <div class="flex justify-between items-center mb-2">
                    <span class="text-sm font-bold text-purple-600">第 ${index + 1} 題</span>
                    <button class="text-red-400 text-xs hover:text-red-600" onclick="removeQuestion(${index})">刪除</button>
                </div>
                <textarea class="w-full p-2 border rounded text-sm mb-2" oninput="updateQText(${index}, this.value)">${q.text}</textarea>
                ${!isTF ? `
                    <div class="grid grid-cols-2 gap-2">
                        ${q.options.map((opt, i) => `
                            <div class="flex items-center gap-1">
                                <input type="radio" name="correct-${index}" ${q.correct.includes(i) ? 'checked' : ''} onchange="updateQCorrect(${index}, ${i})">
                                <input type="text" class="w-full p-1 border rounded text-xs" value="${opt}" oninput="updateQOpt(${index}, ${i}, this.value)">
                            </div>
                        `).join('')}
                    </div>
                ` : `
                    <div class="flex gap-4 text-sm">
                        <label><input type="radio" name="tf-${index}" ${q.is_correct ? 'checked' : ''} onchange="updateTF(${index}, true)"> 是</label>
                        <label><input type="radio" name="tf-${index}" ${!q.is_correct ? 'checked' : ''} onchange="updateTF(${index}, false)"> 否</label>
                    </div>
                `}
                ${q.design_concept ? `<p class="mt-2 text-[10px] text-yellow-600">設計理念：${q.design_concept}</p>` : ''}
            </div>
        `;
        questionsContainer.appendChild(card);
    });
}

// --- 全域編輯輔助函式 ---
window.removeQuestion = (idx) => { generatedQuestions.splice(idx, 1); renderQuestionsForEditing(generatedQuestions); };
window.updateQText = (idx, val) => { generatedQuestions[idx].text = val; };
window.updateQOpt = (idx, oIdx, val) => { generatedQuestions[idx].options[oIdx] = val; };
window.updateQCorrect = (idx, cIdx) => { generatedQuestions[idx].correct = [cIdx]; };
window.updateTF = (idx, val) => { generatedQuestions[idx].is_correct = val; };

// --- 初始化與事件 ---
document.addEventListener('DOMContentLoaded', () => {
    // 讀取設定
    if (getApiKey()) apiKeyInput.value = getApiKey();
    const savedLayout = localStorage.getItem('quizGenLayout_v2');
    if (savedLayout === 'reversed') mainContainer.classList.add('lg:flex-row-reverse');

    // 事件監聽
    document.getElementById('generate-content-btn').onclick = generateContentFromTopic;
    regenerateBtn.onclick = triggerQuestionGeneration;
    saveApiKeyBtn.onclick = () => { localStorage.setItem('gemini_api_key', apiKeyInput.value); showToast('儲存成功'); settingsPopover.classList.remove('open'); };
    settingsBtn.onclick = (e) => { e.stopPropagation(); settingsPopover.classList.toggle('open'); };
    
    // 圖片處理
    imageInput.onchange = (e) => {
        const files = Array.from(e.target.files);
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                uploadedImages.push({ type: file.type, data: ev.target.result.split(',')[1] });
                const img = document.createElement('img');
                img.src = ev.target.result;
                img.className = 'w-full h-20 object-cover rounded';
                imagePreviewContainer.appendChild(img);
                if (autoGenerateToggle.checked) triggerQuestionGeneration();
            };
            reader.readAsDataURL(file);
        });
    };

    // 頁籤切換
    document.querySelectorAll('.tab-btn').forEach((btn, idx) => {
        btn.onclick = () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.tab-content')[idx].classList.add('active');
        };
    });

    // 版面切換
    document.getElementById('layout-toggle-btn').onclick = () => {
        const isRev = mainContainer.classList.toggle('lg:flex-row-reverse');
        localStorage.setItem('quizGenLayout_v2', isRev ? 'reversed' : 'default');
    };
});

function initializeSortable() {
    if (sortableInstance) sortableInstance.destroy();
    sortableInstance = new Sortable(questionsContainer, { handle: '.drag-handle', animation: 150 });
}
