// Path: app/modules/langgraph/agents/dataAwareLLMSystem/tools/schema-introspect.ts
//
// Tool for explicit schema loading (requested as first step).
// Even though we also cache a summary for the system prompt,
// this tool lets the model "see" the schema in a structured way.

import {tool} from "@langchain/core/tools";
import {z} from "zod";
import {getDatasetSchemaSummary} from "../utils/get-dataset-schema-summary.js";

export const getDatasetSchema = tool(
    async () => {
        const summary = await getDatasetSchemaSummary();
        return JSON.stringify({summary}, null, 2);
    },
    {
        name: "get_dataset_schema",
        description:
            "Load a compact summary of available tables/columns in the dataset DB (for query planning).",
        schema: z.object({}),
    },
);
