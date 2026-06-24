import Link from 'next/link';
import { CheckCircle2, FileText, GitBranch, ShieldCheck } from 'lucide-react';

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

export default function AboutPage() {
  return (
    <div className="stack about-page">
      <section className="panel stack">
        <div>
          <div className="eyebrow">About Fin</div>
          <h1 className="h1">Deep research that leaves an evidence trail.</h1>
        </div>
        <p className="lede">
          Fin The Finder is built for analysts who need cited research they can inspect, approve, resume, and improve. The product goal is not a longer
          answer; it is a research run with durable source records, claim checks, human decisions, and exportable reports.
        </p>
        <div className="flow" aria-label="Research workflow">
          <span>Plan</span>
          <span>Search</span>
          <span>Evaluate</span>
          <span>Claim Audit</span>
          <span>Approve</span>
          <span>Report</span>
        </div>
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
          <div className="eyebrow">Version 1.0.0</div>
          <h2 className="h2">What is real today</h2>
        </div>
        <p className="muted">
          The foundation includes typed API routes, Supabase persistence, Mastra agents, Exa/OpenAI integration, contract generation, offline evals,
          claim-ledger persistence, plateau scoring, run-cost estimates, trace-linked events, scoped memory, audit-green dependencies, and repository proof docs.
        </p>
        <p className="muted">
          Measured live benchmark rows and recorded live demo evidence remain tracked in the FDE gate matrix.
        </p>
        <Link className="button secondary" href="/settings">
          Inspect provider status
        </Link>
      </section>
    </div>
  );
}
