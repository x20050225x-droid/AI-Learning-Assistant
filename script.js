import { GoogleGenerativeAI } from "@google/generative-ai";

// --- 核心設定 ---
const MODEL_FALLBACKS = [
    'gemini-2.0-flash-exp', 
    'gemini-1.5-flash',
    'gemini-1.5-pro'
];

const CONFIG = {
    API_BATCH_SIZE: 8,
    DEBOUNCE_DELAY: 800,
    MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024,
    MAX_IMAGE_SIZE_BYTES: 4 * 1024 * 1024,
    MAX_TOTAL_IMAGE_SIZE_BYTES: 15 * 1024 * 1024,
};

// --- DOM 元素選取 (保持不變) ---
const textInput = document.getElementById('text-input');
const numQuestionsInput = document.getElementById('num-questions');
const questionTypeSelect = document.getElementById('question-type-select');
const difficultySelect = document.getElementById('difficulty-select');
const questionStyleSelect = document.getElementById('question-style-select');
const previewLoader = document.getElementById('preview-loader');
const loadingText = document.getElementById('loading-text');
const questionsContainer = document.getElementById('questions-container');
const previewPlaceholder = document.getElementById('preview-placeholder');
const previewActions = document.getElementById('preview-actions');
const regenerateBtn = document.getElementById('regenerate-btn');

// --- 全域狀態 ---
let generatedQuestions = [];
let uploadedImages = [];

// --- 核心 SDK 呼叫函式 ---
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

            // SDK 呼叫：分離 systemInstruction 與 contents
            const result = await model.generateContent({
                contents: payload.contents,
                systemInstruction: payload.systemInstruction
            });

            const response = await result.response;
            const text = response.text();
            
            // 為了相容後續 render 邏輯，回傳符合原結構的物件
            return {
                candidates: [{
                    content: {
                        parts: [{ text: text }]
                    }
                }]
            };

        } catch (error) {
            console.warn(`模型 ${modelName} 失敗:`, error.message);
            lastError = error;
        }
    }
    throw new Error(`所有模型皆無法使用。請檢查 API Key 或網路連線。`);
}

// --- 操作描述對標 ---

/**
 * (1) 執行時機: 當使用者點擊「開始出題」或自動觸發生成時。
 * (2) 執行事項: 
 * 1. 實例化 GoogleGenerativeAI 並傳入 API Key。
 * 2. 遍歷 MODEL_FALLBACKS 嘗試取得可用模型。
 * 3. 呼叫 model.generateContent 並處理 SDK 回傳之 Response。
 */
async function generateSingleBatch(questionsInBatch, questionType, difficulty, text, images, questionStyle, languageChoice) {
    const apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) throw new Error("尚未設定 API Key");

    // 建立系統指令與任務 (簡化版)
    const systemPrompt = `你是一位協助老師出題的專家。
    語言：${languageChoice === 'english' ? 'English' : '繁體中文'}。
    任務：生成 ${questionsInBatch} 題 ${difficulty} 的 ${questionType}。
    要求：嚴格回傳純 JSON 陣列，不含 Markdown 標籤。`;

    // 建立內容 Parts
    const contentsParts = [{ text: `教材內容：${text}` }];
    images.forEach(img => {
        contentsParts.push({ inlineData: { mimeType: img.type, data: img.data } });
    });

    const payload = {
        contents: [{ role: "user", parts: contentsParts }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { responseMimeType: "application/json" }
    };

    const result = await fetchFromGemini(apiKey, payload);
    const jsonText = result.candidates[0].content.parts[0].text;
    return JSON.parse(jsonText.replace(/```json|```/g, '').trim());
}

// (其餘 UI 控制邏輯、事件監聽器與原本 script.js 結構相同，此處省略以保持簡潔)
