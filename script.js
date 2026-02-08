import { GoogleGenerativeAI } from "@google/generative-ai";

// --- PDF.js Worker 設定 ---
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js`;
}

// --- 核心設定 ---
const MODEL_FALLBACKS = [
    'gemini-2.0-flash',        // 最新且快速
    'gemini-1.5-flash',        // 穩定備援
    'gemini-1.5-pro'           // 高階備援
];

const CONFIG = {
    API_BATCH_SIZE: 8,
    DEBOUNCE_DELAY: 800,
    MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024,
    MAX_IMAGE_SIZE_BYTES: 4 * 1024 * 1024,
    MAX_TOTAL_IMAGE_SIZE_BYTES: 15 * 1024 * 1024,
};

// --- DOM 元素選取 ---
const mainContainer = document.getElementById('main-container');
const textInput = document.getElementById('text-input');
const fileInput = document.getElementById('file-input');
const fileNameDisplay = document.getElementById('file-name-display');
const fileErrorDisplay = document.getElementById('file-error-display');
const imageInput = document.getElementById('image-input');
const imagePreviewContainer = document.getElementById('image-preview-container');
const imageErrorDisplay = document.getElementById('image-error-display');
const numQuestionsInput = document.getElementById('num-questions');
const questionTypeSelect = document.getElementById('question-type-select');
const difficultySelect = document.getElementById('difficulty-select');
const questionStyleSelect = document.getElementById('question-style-select');
const formatSelect = document.getElementById('format-select');
const loadingText = document.getElementById('loading-text');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');
const versionBtn = document.getElementById('version-btn');
const versionModal = document.getElementById('version-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const versionHistoryContent = document.getElementById('version-history-content');
const postDownloadModal = document.getElementById('post-download-modal');
const postDownloadModalContent = document.getElementById('post-download-modal-content');
const continueEditingBtn = document.getElementById('continue-editing-btn');
const clearAndNewBtn = document.getElementById('clear-and-new-btn');
const copyContentBtn = document.getElementById('copy-content-btn');
const clearContentBtn = document.getElementById('clear-content-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsPopover = document.getElementById('settings-popover');
const layoutToggleBtn = document.getElementById('layout-toggle-btn');
const themeRadios = document.querySelectorAll('input[name="theme"]');
const apiKeyInput = document.getElementById('api-key-input');
const saveApiKeyBtn = document.getElementById('save-api-key-btn');
const clearApiKeyBtn = document.getElementById('clear-api-key-btn');
const autoGenerateToggle = document.getElementById('auto-generate-toggle');
const tabText = document.getElementById('tab-text');
const tabImage = document.getElementById('tab-image');
const tabAi = document.getElementById('tab-ai');
const contentText = document.getElementById('content-text');
const contentImage = document.getElementById('content-image');
const contentAi = document.getElementById('content-ai');
const topicInput = document.getElementById('topic-input');
const generateContentBtn = document.getElementById('generate-content-btn');
const studentLevelSelect = document.getElementById('student-level-select');
const competencyBasedCheckbox = document.getElementById('competency-based-checkbox');
const generateFromImagesBtn = document.getElementById('generate-from-images-btn');
const previewLoader = document.getElementById('preview-loader');
const previewPlaceholder = document.getElementById('preview-placeholder');
const questionsContainer = document.getElementById('questions-container');
const previewActions = document.getElementById('preview-actions');
const regenerateBtn = document.getElementById('regenerate-btn');
const downloadBtn = document.getElementById('download-btn');
const imageDropZone = document.getElementById('image-drop-zone');
const languageChoiceModal = document.getElementById('language-choice-modal');
const languageChoiceModalContent = document.getElementById('language-choice-modal-content');
const langChoiceZhBtn = document.getElementById('lang-choice-zh-btn');
const langChoiceEnBtn = document.getElementById('lang-choice-en-btn');

const tabs = [tabText, tabImage, tabAi];
const contents = [contentText, contentImage, contentAi];
const controls = [textInput, numQuestionsInput, questionTypeSelect, difficultySelect, questionStyleSelect];

// --- 全域狀態 ---
let generatedQuestions = [];
let sortableInstance = null;
let uploadedImages = [];
let currentRequestController = null;

const questionLoadingMessages = ["AI 老師正在絞盡腦汁出題中...", "靈感正在匯集中，題目即將問世...", "您的專屬考卷即將熱騰騰出爐！"];

// --- 輔助函式 ---
function getApiKey() { return localStorage.getItem('gemini_api_key'); }

function showToast(message, type = 'success') {
    if (toast && toastMessage) {
        toastMessage.textContent = message;
        toast.className = `fixed bottom-5 right-5 text-white py-2 px-5 rounded-lg shadow-xl opacity-0 transition-opacity duration-300 ${type === 'success' ? 'bg-green-500' : 'bg-red-500'} z-50`;
        toast.classList.remove('opacity-0');
        setTimeout(() => { toast.classList.add('opacity-0'); }, 4000);
    }
}

function debounce(func, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

function isAutoGenerateEnabled() {
    const setting = localStorage.getItem('quizGenAutoGenerate_v1');
    return setting === null ? true : setting === 'true';
}

function updateRegenerateButtonState() {
    if (!regenerateBtn || !previewActions) return;
    const hasContent = (textInput && textInput.value.trim() !== '') || uploadedImages.length > 0;
    const isAutoMode = isAutoGenerateEnabled();

    if (!hasContent && !isAutoMode) {
        previewActions.classList.add('hidden');
        return;
    }
    
    if (isAutoMode) {
        if (generatedQuestions.length > 0) {
            previewActions.classList.remove('hidden');
            regenerateBtn.textContent = '手動更新';
        } else {
            previewActions.classList.add('hidden');
        }
    } else {
        if (hasContent) {
            previewActions.classList.remove('hidden');
            regenerateBtn.textContent = generatedQuestions.length > 0 ? '重新生成' : '開始出題';
        } else {
            previewActions.classList.add('hidden');
        }
    }
}

// --- SDK API 呼叫核心 ---
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

            // SDK: systemInstruction 與 contents 分離
            const result = await model.generateContent({
                contents: payload.contents,
                systemInstruction: payload.systemInstruction
            });

            const response = await result.response;
            const text = response.text();
            
            // 模擬舊版回傳結構以相容
            return {
                candidates: [{
                    content: { parts: [{ text: text }] }
                }]
            };

        } catch (error) {
            console.warn(`模型 ${modelName} 失敗:`, error.message);
            lastError = error;
        }
    }
    throw new Error(`所有模型皆無法使用。請確認金鑰權限或網路狀態。(${lastError?.message})`);
}

// --- 內容生成邏輯 ---
async function generateContentFromTopic() {
    const apiKey = getApiKey();
    if (!apiKey) return showToast('請先設定 API Key！', 'error');
    if (!topicInput || !previewLoader) return;

    const topic = topicInput.value;
    if (!topic.trim()) return showToast('請輸入主題！', 'error');
    
    previewLoader.classList.remove('hidden');
    
    try {
        const studentLevel = studentLevelSelect.value;
        const isCompetencyBased = competencyBasedCheckbox.checked;
        const levelText = studentLevelSelect.options[studentLevelSelect.selectedIndex].text;
        
        const systemPrompt = isCompetencyBased 
            ? `你是一位教材設計師。請以「${topic}」為主題，為「${levelText}」學生寫一篇素養導向短文，需包含情境與待解決問題。`
            : `你是一位教材專家。請以「${topic}」為主題，為「${levelText}」學生寫一篇科普短文。`;

        const payload = {
            contents: [{ role: "user", parts: [{ text: `主題：${topic}` }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] }
        };
        
        const result = await fetchFromGemini(apiKey, payload);
        const generatedText = result.candidates?.[0]?.content?.parts?.[0]?.text;

        if (generatedText) {
            textInput.value = generatedText;
            showToast('內文生成成功！', 'success');
            if (copyContentBtn) copyContentBtn.classList.remove('hidden');
            if (tabText) tabText.click();
            if (isCompetencyBased && questionStyleSelect) questionStyleSelect.value = 'competency-based';
            triggerOrUpdate();
        }
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        if (previewLoader) previewLoader.classList.add('hidden');
    }
}

function triggerOrUpdate() {
    if (isAutoGenerateEnabled()) {
        debouncedGenerate();
    } else {
        updateRegenerateButtonState();
    }
}
const debouncedGenerate = debounce(triggerQuestionGeneration, CONFIG.DEBOUNCE_DELAY);

async function triggerQuestionGeneration() {
    const text = textInput ? textInput.value : '';
    if (!text.trim() && uploadedImages.length === 0) return;
    proceedWithGeneration('chinese'); // 預設中文，省略語言偵測以簡化
}

async function proceedWithGeneration(languageChoice) {
    const apiKey = getApiKey();
    if (!apiKey) return showToast('請先設定 API Key！', 'error');

    const text = textInput ? textInput.value : '';
    const totalQuestions = numQuestionsInput ? parseInt(numQuestionsInput.value, 10) : 3;
    const questionType = questionTypeSelect ? questionTypeSelect.value : 'multiple_choice';
    const difficulty = difficultySelect ? difficultySelect.value : '中等';
    const questionStyle = questionStyleSelect ? questionStyleSelect.value : 'knowledge-recall';

    if (previewLoader) previewLoader.classList.remove('hidden');
    if (questionsContainer) questionsContainer.innerHTML = '';
    
    let allGeneratedQs = [];
    
    try {
        const BATCH_SIZE = CONFIG.API_BATCH_SIZE;
        const numBatches = Math.ceil(totalQuestions / BATCH_SIZE);
        for (let i = 0; i < numBatches; i++) {
            const questionsInBatch = Math.min(BATCH_SIZE, totalQuestions - allGeneratedQs.length);
            const batchResult = await generateSingleBatch(questionsInBatch, questionType, difficulty, text, uploadedImages, questionStyle, languageChoice);
            allGeneratedQs = allGeneratedQs.concat(batchResult);
        }
        
        if (allGeneratedQs.length > 0) {
            generatedQuestions = allGeneratedQs;
            renderQuestionsForEditing(generatedQuestions);
            initializeSortable();
            previewActions.classList.remove('hidden');
            previewPlaceholder.classList.add('hidden');
        }
    } catch(error) {
        console.error('Error:', error);
        showToast(error.message, 'error');
    } finally {
        if (previewLoader) previewLoader.classList.add('hidden');
        updateRegenerateButtonState();
    }
}

async function generateSingleBatch(questionsInBatch, questionType, difficulty, text, images, questionStyle, languageChoice) {
    const apiKey = getApiKey();
    
    // 建構 System Prompt
    let coreTask = `生成 ${questionsInBatch} 題 ${difficulty} 難度的`;
    let jsonSchema;

    const mcSchema = {
        type: "ARRAY",
        items: {
            type: "OBJECT",
            properties: {
                text: { type: "STRING" },
                options: { type: "ARRAY", items: { type: "STRING" } },
                correct: { type: "ARRAY", items: { type: "INTEGER" } },
                explanation: { type: "STRING" },
                design_concept: { type: "STRING" } // Optional
            },
            required: ["text", "options", "correct"]
        }
    };
    
    const tfSchema = {
        type: "ARRAY",
        items: {
            type: "OBJECT",
            properties: {
                text: { type: "STRING" },
                is_correct: { type: "BOOLEAN" },
                explanation: { type: "STRING" }
            },
            required: ["text", "is_correct"]
        }
    };

    if (questionType === 'true_false') {
        coreTask += "「是非題」。JSON格式需包含 text 與 is_correct (boolean)。";
        jsonSchema = tfSchema;
    } else {
        coreTask += "「選擇題」。JSON格式需包含 text, options (陣列), correct (正確答案索引陣列)。";
        jsonSchema = mcSchema;
    }

    if (questionStyle === 'competency-based') {
        coreTask += " 需額外包含 design_concept 欄位說明設計理念。";
    }

    const systemPrompt = `你是一位專業出題老師。${coreTask} 語言：繁體中文。嚴格遵守 JSON 格式。`;

    // 建構 Contents
    const contentParts = [];
    if (text.trim()) contentParts.push({ text: `教材文本：\n${text}` });
    
    images.forEach(img => {
        contentParts.push({ inlineData: { mimeType: img.type, data: img.data } });
    });

    const payload = {
        contents: [{ role: "user", parts: contentParts }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { 
            responseMimeType: "application/json",
            responseSchema: jsonSchema
        }
    };
    
    const result = await fetchFromGemini(apiKey, payload);
    const jsonText = result.candidates[0].content.parts[0].text;
    
    try {
        return JSON.parse(jsonText.replace(/```json|```/g, '').trim());
    } catch (e) {
        throw new Error('API 回傳格式錯誤，無法解析 JSON。');
    }
}

// --- UI 渲染與互動 ---
function renderQuestionsForEditing(questions) {
    if (!questionsContainer) return;
    questionsContainer.innerHTML = '';
    questions.forEach((q, index) => {
        const isTF = q.hasOwnProperty('is_correct');
        const card = document.createElement('div');
        card.className = 'question-card bg-gray-50 p-4 rounded-lg shadow-sm border flex gap-x-3 mb-4 group';
        card.dataset.index = index;

        let optionsHtml = '';
        if (!isTF) {
            // 補齊選項至4個
            const opts = q.options || [];
            while(opts.length < 4) opts.push("");
            optionsHtml = opts.map((opt, i) => `
                <div class="flex items-center gap-2 mb-1">
                    <input type="radio" name="q-${index}" value="${i}" ${q.correct.includes(i) ? 'checked' : ''} class="option-radio">
                    <input type="text" value="${opt}" class="option-text flex-grow p-1 border rounded text-sm">
                </div>
            `).join('');
        } else {
            optionsHtml = `
                <div class="flex gap-4">
                    <label><input type="radio" name="tf-${index}" value="true" ${q.is_correct ? 'checked' : ''}> 是</label>
                    <label><input type="radio" name="tf-${index}" value="false" ${!q.is_correct ? 'checked' : ''}> 否</label>
                </div>
            `;
        }

        card.innerHTML = `
            <div class="drag-handle cursor-grab text-gray-400 p-1">☰</div>
            <div class="flex-grow">
                <div class="flex justify-between mb-2">
                    <span class="font-bold text-purple-700">第 ${index + 1} 題</span>
                    <button class="text-red-400 hover:text-red-600 text-xs delete-btn">刪除</button>
                </div>
                <textarea class="q-text w-full p-2 border rounded mb-2 text-sm">${q.text}</textarea>
                ${optionsHtml}
                ${q.design_concept ? `<div class="text-xs text-yellow-600 mt-2 bg-yellow-50 p-2 rounded">💡 設計理念：${q.design_concept}</div>` : ''}
            </div>
        `;
        questionsContainer.appendChild(card);
    });

    // 綁定事件
    document.querySelectorAll('.question-card').forEach(card => {
        const idx = parseInt(card.dataset.index);
        
        // 刪除
        card.querySelector('.delete-btn').onclick = () => {
            generatedQuestions.splice(idx, 1);
            renderQuestionsForEditing(generatedQuestions);
        };
        
        // 文字更新
        card.querySelector('.q-text').oninput = (e) => {
            generatedQuestions[idx].text = e.target.value;
        };

        // 選項更新 (選擇題)
        if (!generatedQuestions[idx].hasOwnProperty('is_correct')) {
            card.querySelectorAll('.option-text').forEach((input, optIdx) => {
                input.oninput = (e) => generatedQuestions[idx].options[optIdx] = e.target.value;
            });
            card.querySelectorAll('.option-radio').forEach(radio => {
                radio.onchange = (e) => { if(e.target.checked) generatedQuestions[idx].correct = [parseInt(e.target.value)]; };
            });
        } else {
            // 是非題更新
            card.querySelectorAll('input[type="radio"]').forEach(radio => {
                radio.onchange = (e) => { 
                    if (e.target.checked) generatedQuestions[idx].is_correct = (e.target.value === 'true');
                };
            });
        }
    });
}

function initializeSortable() {
    if (sortableInstance) sortableInstance.destroy();
    if (questionsContainer) {
        sortableInstance = new Sortable(questionsContainer, {
            handle: '.drag-handle',
            animation: 150,
            onEnd: (evt) => {
                const item = generatedQuestions.splice(evt.oldIndex, 1)[0];
                generatedQuestions.splice(evt.newIndex, 0, item);
                renderQuestionsForEditing(generatedQuestions); // 重繪以更新索引
            }
        });
    }
}

// --- 檔案處理 (PDF/TXT) ---
function handleFile(file) {
    if (!file) return;
    fileNameDisplay.textContent = `已選：${file.name}`;
    
    const reader = new FileReader();
    if (file.type === 'application/pdf') {
        reader.onload = async (e) => {
            try {
                const pdf = await pdfjsLib.getDocument(new Uint8Array(e.target.result)).promise;
                let text = '';
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    text += content.items.map(item => item.str).join(' ');
                }
                textInput.value = text;
                showToast('PDF 讀取成功！');
                tabText.click();
                triggerOrUpdate();
            } catch (err) { showToast('PDF 讀取失敗', 'error'); }
        };
        reader.readAsArrayBuffer(file);
    } else {
        reader.onload = (e) => {
            textInput.value = e.target.result;
            showToast('文字檔讀取成功！');
            tabText.click();
            triggerOrUpdate();
        };
        reader.readAsText(file);
    }
}

// --- 圖片處理 ---
function handleImageFiles(files) {
    if (!files.length) return;
    const { MAX_IMAGE_SIZE_BYTES } = CONFIG;
    
    Array.from(files).forEach(file => {
        if (file.size > MAX_IMAGE_SIZE_BYTES) return showToast(`${file.name} 過大`, 'error');
        const reader = new FileReader();
        reader.onload = (e) => {
            uploadedImages.push({
                id: Date.now() + Math.random(),
                type: file.type,
                data: e.target.result.split(',')[1] // Base64
            });
            const img = document.createElement('img');
            img.src = e.target.result;
            img.className = 'w-24 h-24 object-cover rounded border';
            imagePreviewContainer.appendChild(img);
            triggerOrUpdate();
        };
        reader.readAsDataURL(file);
    });
}

// --- 匯出功能 ---
function exportFile(questions) {
    if (!questions.length) return showToast('無題目可匯出', 'error');
    
    const data = questions.map(q => {
        const isTF = q.hasOwnProperty('is_correct');
        return {
            '題目': q.text,
            '類型': isTF ? '是非' : '選擇',
            '選項': isTF ? '是/否' : q.options.join(' | '),
            '答案': isTF ? (q.is_correct ? '是' : '否') : q.correct.map(i => q.options[i]).join(','),
            '解析': q.explanation || '',
            '設計理念': q.design_concept || ''
        };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Quiz");
    XLSX.writeFile(wb, "AI_Quiz_Export.xlsx");
}

// --- 初始化監聽 ---
document.addEventListener('DOMContentLoaded', () => {
    // API Key
    if (getApiKey()) apiKeyInput.value = getApiKey();
    
    saveApiKeyBtn.onclick = () => {
        const key = apiKeyInput.value.trim();
        if (key) { localStorage.setItem('gemini_api_key', key); showToast('已儲存'); settingsPopover.classList.remove('open'); }
    };
    
    clearApiKeyBtn.onclick = () => { localStorage.removeItem('gemini_api_key'); apiKeyInput.value = ''; showToast('已清除'); };

    // 設定選單
    settingsBtn.onclick = (e) => { e.stopPropagation(); settingsPopover.classList.toggle('open'); };
    document.onclick = (e) => { if (!settingsPopover.contains(e.target) && e.target !== settingsBtn) settingsPopover.classList.remove('open'); };

    // 版面與主題
    if (localStorage.getItem('quizGenLayout_v2') === 'reversed') mainContainer.classList.add('lg:flex-row-reverse');
    layoutToggleBtn.onclick = () => {
        const isRev = mainContainer.classList.toggle('lg:flex-row-reverse');
        localStorage.setItem('quizGenLayout_v2', isRev ? 'reversed' : 'default');
    };

    // 輸入監聽
    fileInput.onchange = (e) => handleFile(e.target.files[0]);
    imageInput.onchange = (e) => handleImageFiles(e.target.files);
    
    // 拖曳上傳
    imageDropZone.ondragover = (e) => { e.preventDefault(); imageDropZone.classList.add('bg-purple-100'); };
    imageDropZone.ondragleave = () => imageDropZone.classList.remove('bg-purple-100');
    imageDropZone.ondrop = (e) => { 
        e.preventDefault(); 
        imageDropZone.classList.remove('bg-purple-100'); 
        handleImageFiles(e.dataTransfer.files); 
    };

    // 按鈕功能
    generateContentBtn.onclick = generateContentFromTopic;
    regenerateBtn.onclick = triggerQuestionGeneration;
    downloadBtn.onclick = () => exportFile(generatedQuestions);
    copyContentBtn.onclick = () => { navigator.clipboard.writeText(textInput.value); showToast('已複製'); };
    clearContentBtn.onclick = () => { 
        textInput.value = ''; uploadedImages = []; imagePreviewContainer.innerHTML = ''; 
        generatedQuestions = []; questionsContainer.innerHTML = ''; 
        updateRegenerateButtonState();
    };

    // 頁籤
    tabs.forEach((tab, i) => tab.onclick = () => {
        tabs.forEach(t => t.classList.remove('active'));
        contents.forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        contents[i].classList.add('active');
        updateRegenerateButtonState();
    });

    // 自動生成開關
    autoGenerateToggle.checked = isAutoGenerateEnabled();
    autoGenerateToggle.onchange = (e) => {
        localStorage.setItem('quizGenAutoGenerate_v1', e.target.checked);
        updateRegenerateButtonState();
    };

    // 控制項變更監聽
    controls.forEach(c => c.addEventListener(c.type === 'text' ? 'input' : 'change', () => {
        if (isAutoGenerateEnabled()) debouncedGenerate();
    }));
});
