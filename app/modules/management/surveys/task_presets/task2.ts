// app/modules/management/surveys/task_presets/task2.ts
//
// Purpose:
// - Task 2 prompt preset (markdown), editable in isolation.
// - Text is kept exactly as provided (only formatted as a template literal).

import type {TaskDefinitionPayload} from "../types";

export function createTask2PromptPreset(): TaskDefinitionPayload {
    return {
        taskNumber: 2,
        title: "Board diversity trend check for an internal briefing",
        promptMarkdown: `# Task 2 - Board diversity trend check for an internal briefing

**Scenario:** Your manager asks you to prepare a short internal briefing on corporate governance diversity. You should summarize how BMW’s board gender diversity has evolved over time and provide a simple multi-year summary.

**Instructions:**
- Work step by step. Do not assume the assistant knows all he also has to search the data.
- Important: Use the data details / source box under answers to see what data the assistant used!
- If you run into issues: You can restart the conversation at any time using the restart/new chat control in the top-right of the chat window.

**Steps:**
1. **Retrieve the value for a specific year (BMW, 2017).**  
For BMW in 2017, determine the exact value (and unit) for the indicator:  
- “Board’s gender diversity ratio”

2. **Retrieve the value range across years (BMW, 2017-2024).**  
For the period 2017-2024, determine:  
- the highest value (year + value + unit), and  
- the lowest value (year + value + unit)  
for “Board’s gender diversity ratio” for BMW.

3. **Summarize the development direction (BMW, 2017-2024).**  
Based on the values the assistant provides, describe whether the indicator increased, decreased, or showed no clear trend over 2017-2024.

4. **Data plausibility check (potential data problem).**  
Inspect the values you collected (including units) and assess: Could there be a problem in the data representation that affects comparability across years?  
If you suspect an issue, briefly describe what the issue could be (e.g., formatting, scaling, unit/representation change) and which years appear affected.

**What to remember for the next page:**
- BMW’s 2017 value (value + unit) for “Board’s gender diversity ratio”.
- Highest and lowest values in 2017-2024 (each with year + value + unit).
- Your conclusion about the trend direction (increasing/decreasing/no clear trend).
- Your assessment from step 4: whether comparability might be affected, and why.`,
        metadata: {
            domain: "corporate_governance",
            taskKey: "board_diversity_trend",
            companyFocus: ["BMW"],
            indicator: "Board’s gender diversity ratio",
            years: [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024],
        },
    };
}
