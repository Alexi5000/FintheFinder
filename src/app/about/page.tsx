import Link from 'next/link';
import { Activity, Boxes, CheckCircle2, ClipboardCheck, Database, FileText, GitBranch, ShieldCheck } from 'lucide-react';
import packageJson from '../../../package.json';

const principles = [
  {
    icon: <FileText size={18} />,
    title: 'Research is data',
    body: 'Sources, evaluations, learnings, claims, approvals, run events, costs, and reports are tracked as product objects.',
  },
  {
    icon: <ShieldCheck size={18} />,
    title: 'Evidence gates readiness',
    body: 'A report should not be ready until critical gaps, citation coverage, contradiction handling, and human review are resolved.',
  },
  {
    icon: <GitBranch size={18} />,
    title: 'Contracts keep it honest',
    body: 'Zod contracts, generated JSON Schema, offline evals, and CI gates make public claims harder to drift.',
  },
  {
    icon: <CheckCircle2 size={18} />,
    title: 'Proof beats polish',
    body: 'Benchmarks, cost rows, demo evidence, and ADRs carry the production story more than broad marketing copy.',
  },
];

const workflow = [
  { label: 'Plan', detail: 'Queries and research strategy' },
  { label: 'Search', detail: 'Exa sources with canonical URLs' },
  { label: 'Evaluate', detail: 'Credibility, relevance, and risks' },
  { label: 'Extract', detail: 'Learnings tied to evidence' },
  { label: 'Claim Audit', detail: 'Contradictions, citations, and gaps' },
  { label: 'Approve', detail: 'Human decision history' },
  { label: 'Report', detail: 'Cited markdown export' },
];

const dataModel = [
  { from: 'Sources', to: 'Learnings', detail: 'Source IDs anchor every extracted learning.' },
  { from: 'Learnings', to: 'Claims', detail: 'Claims inherit evidence and severity.' },
  { from: 'Claims', to: 'Gaps', detail: 'Unsupported or risky claims block readiness.' },
  { from: 'Gaps', to: 'Approvals', detail: 'Reviewers resolve, reject, or explicitly waive gaps.' },
  { from: 'Approvals', to: 'Reports', detail: 'Reports cite claim IDs and source IDs.' },
];

const proofSurfaces = [
  { label: 'Contracts', value: 'Zod + JSON Schema drift hash' },
  { label: 'Runtime', value: 'Next API plus queued worker' },
  { label: 'Persistence', value: 'Supabase tables, RLS, leases' },
  { label: 'Observability', value: 'Events, trace IDs, cost rows' },
  { label: 'Evaluation', value: 'Offline benchmark artifact' },
  { label: 'Deployment', value: 'CI, Docker, audit, smoke' },
];

const status = [
  { label: 'Version', value: packageJson.version },
  { label: 'License', value: packageJson.license },
  { label: 'Release', value: 'v1.0.0' },
  { label: 'Live Proof', value: 'Pending credentials' },
];

export default function AboutPage() {
  return (
    <div className="stack about-page">
      <section className="about-hero">
        <div className="stack">
          <div>
            <div className="eyebrow">About Fin</div>
            <h1 className="h1">Deep research that leaves an evidence trail.</h1>
          </div>
          <p className="lede">
            Fin The Finder is built for analysts who need cited research they can inspect, approve, resume, and improve. The product goal is not a longer
            answer; it is a research run with durable source records, claim checks, human decisions, costs, traces, and exportable reports.
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

      <section className="panel stack">
        <div>
          <div className="eyebrow">Research Workflow</div>
          <h2 className="h2">The path from question to report is explicit.</h2>
        </div>
        <ol className="workflow-diagram" aria-label="Research workflow">
          {workflow.map((step, index) => (
            <li className="workflow-step" key={step.label}>
              <span className="step-index">{String(index + 1).padStart(2, '0')}</span>
              <strong>{step.label}</strong>
              <p>{step.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="about-grid three">
        <article className="panel stack">
          <div className="feature-icon">
            <Database size={18} />
          </div>
          <h2 className="h2">Evidence model</h2>
          <ol className="evidence-chain" aria-label="Evidence data model">
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

        <article className="panel stack">
          <div className="feature-icon">
            <ClipboardCheck size={18} />
          </div>
          <h2 className="h2">Proof surfaces</h2>
          <dl className="proof-list">
            {proofSurfaces.map((surface) => (
              <div className="proof-row" key={surface.label}>
                <dt>{surface.label}</dt>
                <dd>{surface.value}</dd>
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
            Fin started from the Mastra deep-research template and is intentionally documented that way. The value added here is the production hardening:
            typed contracts, Supabase-backed state, worker leases, claim gates, approval history, eval artifacts, cost tracking, and CI proof.
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
          The foundation includes typed API routes, Supabase persistence, Mastra agents, Exa/OpenAI integration, contract generation, offline evals,
          claim-ledger persistence, plateau scoring, run-cost estimates, trace-linked events, scoped memory, audit-green dependencies, and repository proof docs.
        </p>
        <p className="muted">
          Live benchmark rows and recorded demo evidence are still pending configured credentials; the FDE gate matrix tracks that proof explicitly.
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
