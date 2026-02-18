<div align="center">

<img src="assets/icon.png" alt="Fin the Finder Logo" width="120" />

# Fin the Finder

### Your AI Deep Research Assistant

**Ask a question. Fin searches the web, evaluates sources, extracts key insights, and generates a comprehensive report — with you in the loop at every step.**

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Mastra](https://img.shields.io/badge/Mastra-Workflows-ff6b35)](https://mastra.ai)
[![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4-412991?logo=openai)](https://openai.com)
[![Exa](https://img.shields.io/badge/Exa-Web%20Search-00d4aa)](https://exa.ai)

[Features](#features) · [Quick Start](#quick-start) · [How It Works](#how-it-works) · [Architecture](#architecture) · [Agents](#agents)

---

<img src="assets/cover.png" alt="Fin the Finder - AI Deep Research" width="100%" />

</div>

---

## The Problem

Research is time-consuming. You search, open 20 tabs, skim articles, try to figure out what's relevant, take notes, and then struggle to synthesize everything into something coherent. By the time you're done, you've spent hours on what should have been a 15-minute task.

## The Solution

Fin the Finder is an **AI-powered deep research assistant** built on Mastra's workflow engine. Give Fin a topic, and it orchestrates a team of specialized AI agents to search the web, evaluate source relevance, extract key learnings, generate follow-up questions, and compile everything into a polished markdown report. The best part: **you stay in the loop** — approving findings, guiding direction, and iterating until the research meets your standards.

> *"Research quantum computing applications in drug discovery."*
>
> Fin searches, evaluates 15 sources, extracts 23 key insights, suggests 8 follow-up questions, and generates a 3,000-word report — all in under 2 minutes.

---

## Features

- **Human-in-the-Loop** — Review findings, approve or reject, and guide the research direction at every step
- **Multi-Agent Orchestration** — 5 specialized agents working together: research, evaluation, learning extraction, summarization, and report generation
- **Web Search** — Exa API integration for high-quality, relevant web results
- **Source Evaluation** — AI-powered relevance scoring to filter noise from signal
- **Learning Extraction** — Automatically identifies key insights and generates follow-up questions
- **Report Generation** — Comprehensive markdown reports with structured findings
- **Suspend/Resume** — Workflow pauses at strategic points for your input, then picks up exactly where it left off
- **Resilient Operation** — Robust error handling and fallback mechanisms
- **Modular Design** — Each agent and tool can be upgraded independently

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/Alexi5000/FintheFinder.git
cd FintheFinder

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Add your OPENAI_API_KEY and EXA_API_KEY

# Run the research assistant
npm run dev
```

### Prerequisites

- Node.js 20+
- OpenAI API key ([Get one here](https://platform.openai.com))
- Exa API key ([Get one here](https://exa.ai))

### Environment Variables

```bash
OPENAI_API_KEY="your-openai-api-key"
EXA_API_KEY="your-exa-api-key"
```

---

## How It Works

1. **Enter your research topic** — Describe what you want to research
2. **Fin searches the web** — Uses Exa API to find relevant sources
3. **Sources are evaluated** — AI scores each result for relevance
4. **Key learnings extracted** — Insights and follow-up questions identified
5. **You review findings** — Approve, reject, or request more research
6. **Report generated** — Comprehensive markdown report compiled from approved findings

---

## Architecture

```
┌───────────────────────────────────────────┐
│         Mastra Workflow Engine              │
│  mainWorkflow → researchWorkflow           │
│  (orchestration + suspend/resume)          │
└────────────────────┬──────────────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
   ┌────▼────┐ ┌────▼────┐ ┌────▼────┐
   │ Research │ │Evaluate │ │ Report  │
   │  Agent   │ │ Agent   │ │ Agent   │
   └────┬────┘ └────┬────┘ └────┬────┘
        │            │            │
   ┌────▼────┐ ┌────▼────┐ ┌────▼────┐
   │ Web     │ │Evaluate │ │ Extract │
   │ Search  │ │ Result  │ │Learnings│
   │ Tool    │ │ Tool    │ │ Tool    │
   └────┬────┘ └─────────┘ └─────────┘
        │
   ┌────▼────┐
   │ Exa API │
   └─────────┘
```

---

## Agents

| Agent | Role | Description |
|---|---|---|
| **Research Agent** | Web Search | Searches the web via Exa API and collects relevant sources |
| **Evaluation Agent** | Quality Control | Scores source relevance and filters noise |
| **Learning Extraction Agent** | Insight Mining | Extracts key learnings and generates follow-up questions |
| **Web Summarization Agent** | Content Digest | Summarizes web page content for efficient processing |
| **Report Agent** | Report Writer | Compiles findings into comprehensive markdown reports |

---

## Tech Stack

| Component | Technology | Purpose |
|---|---|---|
| **Runtime** | Node.js 20+ | Server-side JavaScript |
| **Language** | TypeScript 5.x | Type-safe development |
| **Framework** | Mastra | Workflow orchestration and agent management |
| **LLM** | OpenAI GPT-4 | AI reasoning and generation |
| **Search** | Exa API | High-quality web search |
| **Validation** | Zod | Runtime type validation |
| **Memory** | @mastra/memory | Conversation and context persistence |
| **Storage** | LibSQL | Local data storage |

---

## Project Structure

```
FintheFinder/
├── src/
│   └── mastra/
│       ├── index.ts              # Mastra instance configuration
│       ├── agents/
│       │   ├── researchAgent.ts      # Web search orchestration
│       │   ├── evaluationAgent.ts    # Source relevance scoring
│       │   ├── learningExtractionAgent.ts  # Insight extraction
│       │   ├── webSummarizationAgent.ts    # Content summarization
│       │   └── reportAgent.ts        # Report generation
│       ├── tools/
│       │   ├── webSearchTool.ts      # Exa API integration
│       │   ├── evaluateResultTool.ts # Relevance evaluation
│       │   └── extractLearningsTool.ts  # Learning extraction
│       └── workflows/
│           ├── researchWorkflow.ts   # Core research loop
│           └── generateReportWorkflow.ts  # Report compilation
├── package.json
├── tsconfig.json
└── .env.example
```

---

## Roadmap

- [ ] Web UI for interactive research sessions
- [ ] PDF and document source analysis
- [ ] Citation management and bibliography generation
- [ ] Research session history and bookmarking
- [ ] Custom agent configurations per research domain
- [ ] Multi-language research support
- [ ] Export to Google Docs, Notion, and Obsidian

---

## Contributing

Contributions welcome! Fork, create a feature branch, and open a PR.

```bash
git checkout -b feature/your-feature
git commit -m "feat: add your feature"
git push origin feature/your-feature
```

---

## License

Apache 2.0 — see [LICENSE](./LICENSE) for details.

---

<div align="center">

**Built by [Alex Cinovoj](https://github.com/Alexi5000) · [TechTide AI](https://github.com/Alexi5000)**

*Research smarter, not harder.*

</div>
