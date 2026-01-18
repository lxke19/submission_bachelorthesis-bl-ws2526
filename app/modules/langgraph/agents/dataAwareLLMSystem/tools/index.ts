// Path: app/modules/langgraph/agents/dataAwareLLMSystem/tools/index.ts

import {sqlQuery} from "./sql-query.js";
import {getDatasetSchema} from "./schema-introspect.js";

export const TOOLS = [getDatasetSchema, sqlQuery];
