import { getProviderStatus } from '@/lib/config';

export default function SettingsPage() {
  const status = getProviderStatus();

  return (
    <section className="panel stack">
      <div>
        <div className="eyebrow">Settings</div>
        <h1 className="h1">Provider and model status</h1>
      </div>
      <table className="table">
        <tbody>
          <tr>
            <th>OpenAI</th>
            <td>
              <span className={status.openai ? 'status good' : 'status bad'}>{status.openai ? 'Configured' : 'Missing'}</span>
            </td>
          </tr>
          <tr>
            <th>Exa</th>
            <td>
              <span className={status.exa ? 'status good' : 'status bad'}>{status.exa ? 'Configured' : 'Missing'}</span>
            </td>
          </tr>
          <tr>
            <th>Supabase</th>
            <td>
              <span className={status.supabase ? 'status good' : 'status bad'}>{status.supabase ? 'Configured' : 'Missing'}</span>
            </td>
          </tr>
          <tr>
            <th>Primary model</th>
            <td>{status.models.primary}</td>
          </tr>
          <tr>
            <th>Fast model</th>
            <td>{status.models.fast}</td>
          </tr>
          <tr>
            <th>Reasoning effort</th>
            <td>{status.models.reasoningEffort}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
