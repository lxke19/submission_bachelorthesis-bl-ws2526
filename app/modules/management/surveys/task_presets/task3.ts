// app/modules/management/surveys/task_presets/task3.ts
//
// Purpose:
// - Task 3 prompt preset (markdown), editable in isolation.
// - Text is kept exactly as provided (only formatted as a template literal).

import type {TaskDefinitionPayload} from "../types";

export function createTask3PromptPreset(): TaskDefinitionPayload {
    return {
        taskNumber: 3,
        title: "Identify and analyze BMW’s direct emissions (partially answerable by design)",
        promptMarkdown: `# Task 3 - Identify and analyze BMW’s direct emissions (partially answerable by design)

**Scenario:** You are asked to support an internal discussion about emissions. Your team specifically wants to understand direct emissions caused by the company itself (i.e., Scope 1), and how this metric changes over time.

**Note (for context):** Scope 1 emissions refer to direct greenhouse gas emissions from sources owned or controlled by the company (e.g., on-site fuel combustion).

**Instructions:**
- Work step by step. Do not assume the assistant knows all he also has to search the data.
- Important: Use the data details / source box under answers to see what data the assistant used!
- If you run into issues: You can restart the conversation at any time using the restart/new chat control in the top-right of the chat window.

**Steps:**
1. **Identify the correct indicator (BMW, Scope 1 direct emissions).**  
Using the dataset, identify the indicator that best matches BMW’s direct Scope 1 greenhouse gas emissions from its own operations.  
Record the exact indicator name you used.

2. **Retrieve values for multiple years (BMW, 2017-2019).**  
Retrieve the indicator values (including unit) for BMW for the years:  
2017, 2018, 2019

3. **Find the maximum year in a broader range (BMW, 2010-2019).**  
For the period 2010-2019, determine:  
- in which year the indicator value was highest, and  
- what the exact value (and unit) was in that year.

**What to remember for the next page:**
- The exact indicator name you identified for BMW’s Scope 1 direct emissions.
- BMW’s values for 2017-2019 (each with value + unit).
- The maximum year in 2010-2019 and the corresponding value + unit.`,
        metadata: {
            domain: "emissions",
            taskKey: "scope1_emissions",
            companyFocus: ["BMW"],
            scope: "Scope 1",
            years: [2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019],
        },
    };
}
