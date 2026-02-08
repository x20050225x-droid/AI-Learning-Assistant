// 狀態管理
let currentQuestions = [];
let currentStats = {
    currentInfo: 0,
    score: 0,
    startTime: 0,
    history: []
};

// 1. 生成題庫核心函式
async function generateQuiz() {
    const apiKey = document.getElementById('apiKey').value.trim(); // 加上 trim() 去除空白
    const content = document.getElementById('learningContent').value;
    const qType = document.getElementById('qType').value;
    const difficulty = document.getElementById('difficulty').value;
    const count = document.getElementById('qCount').value;

    if (!apiKey || !content) {
        alert("請輸入 API Key 與 教材內容");
        return;
    }

    const btn = document.getElementById('generateBtn');
    const originalBtnText = btn.textContent;
    btn.textContent = "AI 正在分析教材並出題中...";
    btn.disabled = true;

    // 定義 Prompt
    const prompt = `
    你是一個專業的教師。請根據以下教材內容，生成 ${count} 題 ${difficulty} 程度的 ${qType}。
    
    【教材內容】：
    ${content}

    【格式要求】：
    請嚴格回覆一個 JSON Array，不要有 Markdown 標記 (如 \`\`\`json)。格式如下：
    [
        {
            "question": "題目敘述",
            "options": ["選項A", "選項B", "選項C", "選項D"], 
            "answer": 0, (正確選項的索引值，0代表第一個選項)
            "explanation": "詳細解析"
        }
    ]
    `;

    // 嘗試使用的模型清單 (如果第一個失敗，你可以手動改這裡)
    // 建議使用 'gemini-1.5-flash' 或 'gemini-pro'
    const modelName = 'gemini-pro';

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await response.json();

        // 檢查 API 是否回傳錯誤
        if (!response.ok) {
            console.error("API Error Details:", data); // 在 Console 顯示詳細錯誤
            throw new Error(data.error?.message || "API 請求失敗");
        }

        // 檢查是否有回傳 candidates
        if (!data.candidates || data.candidates.length === 0) {
            throw new Error("AI 沒有回傳任何內容，請稍後再試。");
        }

        const text = data.candidates[0].content.parts[0].text;
        
        // 清理可能的回傳雜訊
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        try {
            currentQuestions = JSON.parse(jsonStr);
        } catch (e) {
            console.error("JSON Parse Error:", text);
            throw new Error("AI 回傳的格式無法解析，請重新生成一次。");
        }

        startQuiz();

    } catch (error) {
        console.error(error);
        alert(`發生錯誤：${error.message}\n(請按 F12 開啟 Console 查看詳細內容)`);
    } finally {
        btn.textContent = originalBtnText;
        btn.disabled = false;
    }
}

// 2. 測驗流程控制
function startQuiz() {
    currentStats.currentInfo = 0;
    currentStats.score = 0;
    currentStats.history = [];
    
    document.getElementById('setup-panel').classList.add('hidden');
    document.getElementById('quiz-panel').classList.remove('hidden');
    
    loadQuestion(0);
}

function loadQuestion(index) {
    if (index >= currentQuestions.length) {
        showResults();
        return;
    }

    const q = currentQuestions[index];
    currentStats.startTime = Date.now();

    document.getElementById('progress-text').textContent = `題目 ${index + 1} / ${currentQuestions.length}`;
    document.getElementById('question-text').textContent = q.question;
    document.getElementById('feedback-area').classList.add('hidden');

    const optsContainer = document.getElementById('options-container');
    optsContainer.innerHTML = '';

    // 處理是非題或選擇題的選項顯示
    const options = q.options || ["是", "否"]; 
    
    options.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.textContent = opt;
        btn.onclick = () => checkAnswer(i, btn);
        optsContainer.appendChild(btn);
    });
}

// 3. 判斷答案與記錄數據
function checkAnswer(selectedIndex, btnElement) {
    const currentQ = currentQuestions[currentStats.currentInfo];
    const timeTaken = (Date.now() - currentStats.startTime) / 1000;
    const isCorrect = (selectedIndex === currentQ.answer);

    const opts = document.querySelectorAll('.option-btn');
    opts.forEach(btn => btn.disabled = true);

    if (isCorrect) {
        btnElement.classList.add('correct');
        currentStats.score++;
    } else {
        btnElement.classList.add('wrong');
        // 如果該題有選項陣列，顯示正確答案；否則不特別標示
        if(opts[currentQ.answer]) {
             opts[currentQ.answer].classList.add('correct');
        }
    }

    currentStats.history.push({
        qId: currentStats.currentInfo,
        correct: isCorrect,
        time: timeTaken
    });

    document.getElementById('explanation-text').textContent = `解析：${currentQ.explanation}`;
    document.getElementById('feedback-area').classList.remove('hidden');
}

function nextQuestion() {
    currentStats.currentInfo++;
    loadQuestion(currentStats.currentInfo);
}

// 4. 學習分析報告
function showResults() {
    document.getElementById('quiz-panel').classList.add('hidden');
    document.getElementById('result-panel').classList.remove('hidden');

    const total = currentQuestions.length;
    const accuracy = total === 0 ? 0 : Math.round((currentStats.score / total) * 100);
    const avgTime = total === 0 ? 0 : (currentStats.history.reduce((a, b) => a + b.time, 0) / total).toFixed(1);

    document.getElementById('final-score').textContent = `${accuracy}%`;
    document.getElementById('avg-time').textContent = `${avgTime}s`;

    let advice = "";
    if (accuracy >= 80) {
        advice = "太棒了！你對這部分的教材掌握度很高。";
    } else if (accuracy >= 60) {
        advice = "表現不錯，但仍有部分觀念模糊，建議複習錯題解析。";
    } else {
        advice = "此單元基礎較為薄弱，建議重新精讀教材內容。";
    }
    
    document.getElementById('ai-advice').textContent = advice;
}

function resetSystem() {
    document.getElementById('result-panel').classList.add('hidden');
    document.getElementById('setup-panel').classList.remove('hidden');
}


