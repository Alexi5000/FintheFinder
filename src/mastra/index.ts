import { Mastra } from '@mastra/core';
import { LibSQLStore } from '@mastra/libsql';
import { researchWorkflow } from './workflows/researchWorkflow';
import { learningExtractionAgent } from './agents/learningExtractionAgent';
import { evaluationAgent } from './agents/evaluationAgent';
import { reportAgent } from './agents/reportAgent';
import { researchAgent } from './agents/researchAgent';
import { webSummarizationAgent } from './agents/webSummarizationAgent';
import { generateReportWorkflow } from './workflows/generateReportWorkflow';
import { plannerAgent } from './agents/plannerAgent';
import { contradictionAgent } from './agents/contradictionAgent';
import { citationAuditorAgent } from './agents/citationAuditorAgent';
import { finalReviewerAgent } from './agents/finalReviewerAgent';

export const mastra = new Mastra({
  storage: new LibSQLStore({
    id: 'fin-local-workflow-store',
    url: 'file:../mastra.db',
  }),
  agents: {
    plannerAgent,
    researchAgent,
    reportAgent,
    evaluationAgent,
    learningExtractionAgent,
    webSummarizationAgent,
    contradictionAgent,
    citationAuditorAgent,
    finalReviewerAgent,
  },
  workflows: { generateReportWorkflow, researchWorkflow },
});
