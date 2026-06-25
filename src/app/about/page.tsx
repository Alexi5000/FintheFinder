import Link from 'next/link';
import { Activity, Boxes, CheckCircle2, ClipboardCheck, Database, FileText, GitBranch, ShieldCheck } from 'lucide-react';
import packageJson from '../../../package.json';

const principles = [
  {
    icon: <Boxes size={18} />,
    title: 'Mastra primitives stay visible',
    body: 'Agents, tools, workflows, and the registry remain easy to inspect so the product does not hide its orchestration model.',
  },
  {
    icon: <ShieldCheck size={18} />,
    title: 'Evidence gates readiness',
    body: 'A report should not be ready until source quality, citation coverage, contradiction handling, and human review are resolved.',
  },
  {
    icon: <GitBranch size={18} />,
    title: 'Contracts keep claims honest',
    body: 'Zod contracts, generated JSON Schema, offline evals, orchestration replay, and CI gates make public claims harder to drift.',
  },
  {
    icon: <CheckCircle2 size={18} />,
    title: 'Proof stays tied to artifacts',
    body: 'Benchmarks, cost rows, demo manifests, media, approvals, and ADRs carry the production story more than broad marketing copy.',
  },
];

const workflow = [
  { label: 'Plan', detail: 'Planner agent turns the question into research strategy.' },
  { label: 'Search', detail: 'Exa sources are normalized into durable records.' },
  { label: 'Evaluate', detail: 'Source evaluator checks relevance, credibility, and risk.' },
  { label: 'Extract', detail: 'Learning extractor ties findings back to source IDs.' },
  { label: 'Audit', detail: 'Contradiction and citation agents check claims.' },
  { label: 'Approve', detail: 'Human decisions are captured as status history.' },
  { label: 'Report', detail: 'Report writer and final reviewer produce cited markdown.' },
];

const mastraSurfaces = [
  {
    label: 'Agents',
    value: 'Planner, research, evaluator, extractor, auditors, writer, reviewer',
    detail: 'Specialist roles stay explicit instead of being collapsed into one generic assistant.',
  },
  {
    label: 'Tools',
    value: 'webSearchTool, evaluateResultTool, extractLearningsTool',
    detail: 'Tool inputs and outputs are typed, persisted, and replayed through deterministic fixtures.',
  },
  {
    label: 'Workflows',
    value: 'researchWorkflow and generateReportWorkflow',
    detail: 'The question-to-report path is a named orchestration surface with approval gates.',
  },
  {
    label: 'Hardening',
    value: 'Worker, Supabase, evals, costs, traces, proof export',
    detail: 'The template lineage is wrapped in production data, observability, and verification.',
  },
];

const dataModel = [
  { from: 'Sources', to: 'Learnings', detail: 'Source IDs anchor every extracted learning.' },
  { from: 'Learnings', to: 'Claims', detail: 'Claims inherit evidence, confidence, and severity.' },
  { from: 'Claims', to: 'Gaps', detail: 'Unsupported or risky claims block readiness.' },
  { from: 'Gaps', to: 'Approvals', detail: 'Reviewers resolve, reject, or explicitly waive gaps.' },
  { from: 'Approvals', to: 'Reports', detail: 'Reports cite claim IDs and source IDs.' },
];

const proofSurfaces = [
  {
    label: 'Contracts',
    status: 'CI verified',
    value: 'Zod plus JSON Schema drift hash',
    detail: 'CI fails when the generated contract artifact drifts.',
  },
  {
    label: 'Runtime',
    status: 'Unit verified',
    value: 'Next API plus queued worker',
    detail: 'Hosted routes enqueue durable work and the worker owns long-running execution.',
  },
  {
    label: 'Persistence',
    status: 'Migration verified',
    value: 'Supabase tables, RLS, leases',
    detail: 'Migration and repository tests cover ownership, claims, approvals, and graph integrity.',
  },
  {
    label: 'Observability',
    status: 'Contract verified',
    value: 'Events, trace IDs, cost rows',
    detail: 'Run events and cost records stay correlated to sessions, runs, and failure post-mortems.',
  },
  {
    label: 'Evaluation',
    status: 'Offline verified',
    value: 'Fixtures plus orchestration replay',
    detail: 'The eval suite includes positive cases, adversarial controls, and credential-free worker replay.',
  },
  {
    label: 'Live demo',
    status: 'Pending configured credentials',
    value: 'demo:export, demo:record, evals:live',
    detail: 'No live claim is approved until the manifest, Supabase lineage, eval output, media, and benchmark row agree.',
  },
  {
    label: 'Deployment',
    status: 'CI and Docker configured',
    value: 'Build, audit, smoke, container',
    detail: 'Local verification and GitHub Actions exercise build, tests, container, audit, and smoke checks.',
  },
];

const status = [
  { label: 'Version', value: packageJson.version },
  { label: 'License', value: packageJson.license },
  { label: 'Mastra', value: '1.x' },
  { label: 'Proof Tier', value: 'Offline-gated' },
  { label: 'Live Proof', value: 'Pending credentials' },
];

export default function AboutPage() {
  return (
    <div className="stack about-page">
      <section className="about-hero">
        <div className="stack">
          <div>
            <div className="eyebrow">About Fin</div>
            <h1 className="h1">Mastra-based research that leaves an evidence trail.</h1>
          </div>
          <p className="lede">
            Fin the Finder is built for analysts who need cited research they can inspect, approve, resume, and improve. It began with the Mastra
            deep-research template, then adds product hardening around contracts, Supabase persistence, queued execution, evals, costs, traces, approvals, and
            provenance-bound demo proof.
          </p>
          <div className="about-actions">
            <Link className="button" href="/">
              <Activity size={16} />
              Open workspace
            </Link>
            <Link className="button secondary" href="/settings">
              <ShieldCheck size={16} />
              Inspect providers
            </Link>
          </div>
        </div>
        <dl className="version-panel" aria-label="Product status">
          {status.map((item) => (
            <div className="version-row" key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="panel stack" aria-labelledby="research-workflow-title">
        <div>
          <div className="eyebrow" id="research-workflow-label">
            Mastra Workflow
          </div>
          <h2 className="h2" id="research-workflow-title">
            The path from question to report is explicit.
          </h2>
        </div>
        <ol className="workflow-diagram" aria-labelledby="research-workflow-label">
          {workflow.map((step, index) => (
            <li className="workflow-step" key={step.label}>
              <span className="step-index" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <strong>{step.label}</strong>
              <p>{step.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="panel stack" aria-labelledby="mastra-map-title">
        <div>
          <div className="eyebrow">Built with Mastra</div>
          <h2 className="h2" id="mastra-map-title">
            Template lineage, production surface.
          </h2>
        </div>
        <dl className="proof-list" aria-labelledby="mastra-map-title">
          {mastraSurfaces.map((surface) => (
            <div className="proof-row" key={surface.label}>
              <dt>
                <span>{surface.label}</span>
                <span className="proof-status">Mapped</span>
              </dt>
              <dd>
                <strong>{surface.value}</strong>
                <span>{surface.detail}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="about-grid three">
        <article className="panel stack" aria-labelledby="evidence-model-title">
          <div className="feature-icon">
            <Database size={18} />
          </div>
          <h2 className="h2" id="evidence-model-title">
            Evidence model
          </h2>
          <ol className="evidence-chain" aria-labelledby="evidence-model-title">
            {dataModel.map((edge) => (
              <li className="evidence-edge" key={`${edge.from}-${edge.to}`}>
                <div>
                  <strong>{edge.from}</strong>
                  <span>to {edge.to}</span>
                </div>
                <p>{edge.detail}</p>
              </li>
            ))}
          </ol>
        </article>

        <article className="panel stack" aria-labelledby="proof-surfaces-title">
          <div className="feature-icon">
            <ClipboardCheck size={18} />
          </div>
          <h2 className="h2" id="proof-surfaces-title">
            Proof surfaces
          </h2>
          <dl className="proof-list" aria-labelledby="proof-surfaces-title">
            {proofSurfaces.map((surface) => (
              <div className="proof-row" key={surface.label}>
                <dt>
                  <span>{surface.label}</span>
                  <span className="proof-status">{surface.status}</span>
                </dt>
                <dd>
                  <strong>{surface.value}</strong>
                  <span>{surface.detail}</span>
                </dd>
              </div>
            ))}
          </dl>
        </article>

        <article className="panel stack">
          <div className="feature-icon">
            <Boxes size={18} />
          </div>
          <h2 className="h2">Lineage</h2>
          <p className="muted">
            Fin started from the Mastra deep-research template and is intentionally documented that way. The repo value is the production foundation around it:
            typed contracts, Supabase-backed state, worker leases, claim gates, approval history, eval artifacts, cost tracking, OpenTelemetry hooks, and CI gates.
          </p>
        </article>
      </section>

      <section className="about-grid">
        {principles.map((principle) => (
          <article className="card feature-card" key={principle.title}>
            <div className="feature-icon">{principle.icon}</div>
            <h2 className="h2">{principle.title}</h2>
            <p className="muted">{principle.body}</p>
          </article>
        ))}
      </section>

      <section className="panel stack">
        <div>
          <div className="eyebrow">Version {packageJson.version}</div>
          <h2 className="h2">What is real today</h2>
        </div>
        <p className="muted">
          The foundation includes typed API routes, Supabase persistence, Mastra agents, Exa and OpenAI integration, contract generation, offline evals,
          orchestration replay, claim-ledger persistence, plateau scoring, run-cost estimates, trace-linked events, scoped memory, audit-green dependencies, and
          repository proof docs.
        </p>
        <p className="muted">
          Configured-live benchmark rows and recorded demo evidence remain intentionally pending real provider credentials, Supabase proof rows, and media. The
          FDE gate matrix tracks that proof explicitly.
        </p>
        <div className="about-actions">
          <Link className="button secondary" href="/api/research/evals">
            <FileText size={16} />
            View eval JSON
          </Link>
          <Link className="button secondary" href="/settings">
            <ShieldCheck size={16} />
            Inspect provider status
          </Link>
        </div>
      </section>
    </div>
  );
}
