// 狀態管理
let currentQuestions = [];
let currentStats = {
    currentInfo: 0,
    score: 0,
    startTime: 0,
    history: [] // 記錄每一題的作答數據 
};

// 1. 生成題庫核心函式 [cite: 12]
async function generateQuiz() {
    const apiKey = document.getElementById('apiKey').value;
    const content = document.getElementById('learningContent').value;
    const qType = document.getElementById('qType').value;
    const difficulty = document.getElementById('difficulty').value;
    const count = document.getElementById('qCount').value;

    if (!apiKey || !content) {
        alert("請輸入 API Key 與 教材內容");
        return;
    }

    const btn = document.getElementById('generateBtn');
    btn.textContent = "AI 正在分析教材並出題中...";
    btn.disabled = true;

    // 定義 Prompt，強制要求 JSON 格式 [cite: 23]
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

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await response.json();
        const text = data.candidates[0].content.parts[0].text;
        
        // 清理可能的回傳雜訊 (移除 markdown code block)
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        currentQuestions = JSON.parse(jsonStr);

        startQuiz();

    } catch (error) {
        console.error(error);
        alert("生成失敗，請檢查 API Key 或網路連線。");
    } finally {
        btn.textContent = "生成測驗";
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
    currentStats.startTime = Date.now(); // 開始計時 

    document.getElementById('progress-text').textContent = `題目 ${index + 1} / ${currentQuestions.length}`;
    document.getElementById('question-text').textContent = q.question;
    document.getElementById('feedback-area').classList.add('hidden');

    const optsContainer = document.getElementById('options-container');
    optsContainer.innerHTML = '';

    q.options.forEach((opt, i) => {
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

    // 視覺回饋
    const opts = document.querySelectorAll('.option-btn');
    opts.forEach(btn => btn.disabled = true); // 鎖定按鈕

    if (isCorrect) {
        btnElement.classList.add('correct');
        currentStats.score++;
    } else {
        btnElement.classList.add('wrong');
        opts[currentQ.answer].classList.add('correct'); // 顯示正解
    }

    // 記錄學習行為資料 
    currentStats.history.push({
        qId: currentStats.currentInfo,
        correct: isCorrect,
        time: timeTaken
    });

    // 顯示解析
    document.getElementById('explanation-text').textContent = `解析：${currentQ.explanation}`;
    document.getElementById('feedback-area').classList.remove('hidden');
}

function nextQuestion() {
    currentStats.currentInfo++;
    loadQuestion(currentStats.currentInfo);
}

// 4. 學習分析報告 [cite: 16, 17]
function showResults() {
    document.getElementById('quiz-panel').classList.add('hidden');
    document.getElementById('result-panel').classList.remove('hidden');

    const total = currentQuestions.length;
    const accuracy = Math.round((currentStats.score / total) * 100);
    const avgTime = (currentStats.history.reduce((a, b) => a + b.time, 0) / total).toFixed(1);

    document.getElementById('final-score').textContent = `${accuracy}%`;
    document.getElementById('avg-time').textContent = `${avgTime}s`;

    // 產生建議邏輯
    let advice = "";
    if (accuracy >= 80) {
        advice = "太棒了！你對這部分的教材掌握度很高。建議可以嘗試挑戰「困難」模式，或進入下一個章節。";
    } else if (accuracy >= 60) {
        advice = "表現不錯，但仍有部分觀念模糊。建議針對錯誤題目的解析重新複習教材中的特定段落。";
    } else {
        advice = "此單元基礎較為薄弱。建議放慢速度，重新精讀教材內容後再進行測試，避免囫圇吞棗。";
    }
    
    if (avgTime > 60) {
        advice += " 另外，你的作答時間偏長，建議多練習以提升熟練度。";
    }

    document.getElementById('ai-advice').textContent = advice;
}

function resetSystem() {
    document.getElementById('result-panel').classList.add('hidden');
    document.getElementById('setup-panel').classList.remove('hidden');
}