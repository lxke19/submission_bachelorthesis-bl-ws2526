// app/modules/management/surveys/task_presets/task1.ts
//
// Purpose:
// - Task 1 prompt preset (markdown), editable in isolation.
// - Text is kept exactly as provided (only formatted as a template literal).

import type {TaskDefinitionPayload} from "../types";

export function createTask1PromptPreset(): TaskDefinitionPayload {
    return {
        taskNumber: 1,
        title: "Get familiar with the dataset",
        promptMarkdown: `# Task 1 - Get familiar with the dataset

**Scenario:** You have just joined a small sustainability analytics team. Your supervisor asks you to quickly gather a few basic facts about the ESG dataset your team uses. Fortunately, your organization has recently introduced an internal AI analytics assistant that can answer questions by querying the dataset and can also show data details about what information was used for each answer. Your goal is to use this assistant to retrieve the requested information as reliably as possible.

**How to work on the task (read before starting):**
- Work step by step and ask the assistant one question at a time.
- The assistant may sometimes make mistakes or misunderstand requests. Make sure to keep this in mind.
- Important: Use the data details / source box under answers to see what data the assistant used!
- If you run into issues: You can restart the conversation at any time using the restart/new chat control in the top-right of the chat window.

**Steps:**
1. **Count German companies in the dataset.**  
Ask the assistant to determine how many distinct companies from Germany are included in the dataset.  
Prompt can be: “How many distinct companies from Germany are included in the dataset?”

2. **Find Siemens AG and check availability for a specific year.**  
Locate Siemens in the dataset and confirm whether Siemens AG has data for the year 2017.  
Prompt can be: “Is Siemens included in the dataset, and do we have a record for Siemens in 2017?”

3. **Workforce gender indicator (Siemens, 2017).**  
For Siemens in 2017, retrieve the value (including unit) for the indicator:  
“Number of employees (head count), at end of period” - Specification: “Female”  
Also determine whether this indicator is available/missing for Siemens in 2017 (i.e., whether the dataset contains a value).  
Prompt can be: “For Siemens in 2017, what is the value and unit for ‘Number of employees (head count), at end of period’ (Specification: Female)? Is the value available or missing?”

**What to remember for the next page:**
- Number of distinct German companies in the dataset.
- Whether Siemens is included and whether Siemens has a record for 2017.
- The female headcount value for Siemens in 2017 (value + unit), and whether it was available/missing.`,
        metadata: {
            domain: "esg_dataset",
            taskKey: "dataset_familiarization",
            companyFocus: ["Siemens AG"],
            countryFocus: ["Germany"],
            years: [2017],
        },
    };
}
