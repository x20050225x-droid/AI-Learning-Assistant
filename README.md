# AI 學習助理 - 專題示範版

使用 AI 自動分析教材內容並生成測驗題目，支援即時作答與批改解析。

## 功能特色

- **AI 自動出題**：貼上教材文字，AI 根據內容生成指定數量的測驗題
- **多種題型**：支援選擇題，可調整難度
- **即時批改**：作答後立即顯示正確答案與解析
- **作答統計**：記錄每題作答時間，統計整體表現

## 技術架構

- **AI 模型**：Google Gemini API（gemini-1.5-flash）
- **前端**：原生 HTML / CSS / JavaScript
- **部署**：GitHub Pages 靜態網頁

## 使用方式

1. 開啟網頁（`index.html`）
2. 輸入你的 Gemini API Key
3. 貼上教材內容
4. 選擇題型、難度、題數
5. 按下「生成題目」，AI 即自動出題

## 檔案結構

```
AI-Learning-Assistant.io/
├── index.html      # 主頁面（UI 介面）
├── script.js       # 主程式（API 串接、出題邏輯、作答流程）
├── style.css       # 樣式表
└── README.md
```

> **注意**：使用 AI 出題功能需要自行申請 [Google Gemini API Key](https://aistudio.google.com/apikey)。
