import { GoogleGenerativeAI } from "@google/generative-ai";

// --- 核心設定：模型候補名單 ---
const MODEL_FALLBACKS = [
    'gemini-2.0-flash-exp',
    'gemini-1.5-flash',
    'gemini-1.5-pro'
];

// --- DOM 元素選取 ---
const textInput = document.getElementById('text-input');
const imageInput = document.getElementById('image-input');
const imagePreviewContainer = document.getElementById('image-preview-container');
const numQuestionsInput = document.getElementById('num-questions');
const difficultySelect = document.getElementById('difficulty-select');
const loadingText = document.getElementById('loading-text');
const previewLoader = document.getElementById('preview-loader');
const questionsContainer = document.getElementById('questions-container');
const previewPlaceholder = document.getElementById('preview-placeholder');
const regenerateBtn = document.getElementById('regenerate-btn');
const downloadBtn = document.getElementById('download-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsPopover = document.getElementById('settings-popover');
const apiKeyInput = document.getElementById('api-key-input');
const saveApiKeyBtn = document.getElementById('save-api-key-btn');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');

// --- 全域狀態 ---
let generatedQuestions = [];
let uploadedImages = [];
let sortableInstance = null;

// --- 工具函式 ---
function showToast(message, type = 'success') {
    toastMessage.textContent = message;
    toast.className = `fixed bottom-5 right-5 text-white py-2 px-5 rounded-lg shadow-xl transition-opacity duration-300 ${type === 'success' ? 'bg-green-500' : 'bg-red-500'} z-50`;
    toast.style.opacity = '1';
    setTimeout(() => { toast.style.opacity = '0'; }, 3000);
}

// --- 核心 SDK 調用邏輯 ---
async function fetchFromGemini(apiKey, payload) {
    const genAI = new GoogleGenerativeAI(apiKey);
    let lastError = null;

    for (const modelName of MODEL_FALLBACKS) {
        try {
            if (loadingText) loadingText.textContent = `嘗試連線模型: ${modelName}...`;
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
            console.warn(`${modelName} 失敗:`, error.message);
            lastError = error;
        }
    }
    throw new Error(`所有模型皆不可用。請檢查 API Key。(${lastError?.message})`);
}

// --- 生成題目核心邏輯 ---
async function generateQuestions() {
    const apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) return showToast('請先設定 API Key！', 'error');

    const text = textInput.value.trim();
    if (!text && uploadedImages.length === 0) return showToast('請提供教材內容或圖片！', 'error');

    previewLoader.classList.remove('hidden');
    previewPlaceholder?.classList.add('hidden');
    questionsContainer.innerHTML = '';

    try {
        const num = numQuestionsInput.value;
        const diff = difficultySelect.value;
        
        const systemPrompt = `你是一位專業出題老師。請根據教材生成 ${num} 題${diff}難度的選擇題。
        必須嚴格回傳 JSON 陣列格式，包含：
        "text": 題目, "options": [選項1, 選項2, 選項3, 選項4], "correct": [正確索引(0-3)]。
        語言：繁體中文。不要包含 Markdown 標籤。`;

        const contentParts = [{ text: `教材內容：\n${text}` }];
        uploadedImages.forEach(img => {
            contentParts.push({ inlineData: { mimeType: img.type, data: img.data } });
        });

        const payload = {
            contents: [{ role: "user", parts: contentParts }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: { responseMimeType: "application/json" }
        };

        const rawJson = await fetchFromGemini(apiKey, payload);
        const cleanedJson = rawJson.replace(/```json|```/g, '').trim();
        generatedQuestions = JSON.parse(cleanedJson);

        renderQuestions();
        showToast('題目生成成功！');
    } catch (error) {
        console.error(error);
        showToast(error.message, 'error');
    } finally {
        previewLoader.classList.add('hidden');
    }
}

// --- UI 渲染與互動 ---
function renderQuestions() {
    questionsContainer.innerHTML = '';
    generatedQuestions.forEach((q, idx) => {
        const div = document.createElement('div');
        div.className = 'bg-gray-50 p-4 rounded-lg border shadow-sm relative group';
        div.innerHTML = `
            <div class="font-bold text-purple-700 mb-2">第 ${idx + 1} 題</div>
            <textarea class="w-full p-2 border rounded mb-2 text-sm">${q.text}</textarea>
            <div class="grid grid-cols-2 gap-2">
                ${q.options.map((opt, i) => `
                    <div class="flex items-center gap-2">
                        <input type="radio" name="q-${idx}" ${q.correct.includes(i) ? 'checked' : ''}>
                        <input type="text" value="${opt}" class="w-full p-1 border rounded text-xs">
                    </div>
                `).join('')}
            </div>
        `;
        questionsContainer.appendChild(div);
    });
    
    if (Sortable && questionsContainer) {
        sortableInstance = new Sortable(questionsContainer, { animation: 150 });
    }
}

// --- 圖片處理 ---
imageInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const base64 = ev.target.result.split(',')[1];
            uploadedImages.push({ type: file.type, data: base64 });
            const img = document.createElement('img');
            img.src = ev.target.result;
            img.className = 'w-full h-20 object-cover rounded border';
            imagePreviewContainer.appendChild(img);
        };
        reader.readAsDataURL(file);
    });
});

// --- 事件綁定 ---
settingsBtn.onclick = (e) => { e.stopPropagation(); settingsPopover.classList.toggle('open'); };
saveApiKeyBtn.onclick = () => {
    const key = apiKeyInput.value.trim();
    if (key) {
        localStorage.setItem('gemini_api_key', key);
        showToast('Key 已儲存');
        settingsPopover.classList.remove('open');
    }
};

regenerateBtn.onclick = generateQuestions;

downloadBtn.onclick = () => {
    if (generatedQuestions.length === 0) return showToast('沒有題目可匯出', 'error');
    const ws = XLSX.utils.json_to_sheet(generatedQuestions.map(q => ({
        '題目': q.text,
        '選項': q.options.join(' | '),
        '正確答案': q.correct.map(i => q.options[i]).join(',')
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Quiz");
    XLSX.writeFile(wb, "AI_Quiz.xlsx");
};

// 頁籤切換
document.getElementById('tab-text').onclick = function() {
    this.classList.add('active');
    document.getElementById('tab-image').classList.remove('active');
    document.getElementById('content-text').classList.add('active');
    document.getElementById('content-image').classList.remove('active');
};
document.getElementById('tab-image').onclick = function() {
    this.classList.add('active');
    document.getElementById('tab-text').classList.remove('active');
    document.getElementById('content-image').classList.add('active');
    document.getElementById('content-text').classList.remove('active');
};

// 初始化讀取 Key
if (localStorage.getItem('gemini_api_key')) {
    apiKeyInput.value = localStorage.getItem('gemini_api_key');
}
