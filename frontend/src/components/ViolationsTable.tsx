import { useMemo, useState } from 'react';
import { EVENT_TYPES, type Violation } from '../types/contract';

const EVENT_LABEL: Record<string, string> = {
  HELMET_REMOVED: 'Helmet removed',
  LINK_LOST: 'Link lost',
};
const ACTION_LABEL: Record<string, string> = {
  TOOL_DISABLED: 'Tool disabled',
  NONE: 'None',
};

const timeFmt = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'short',
  timeStyle: 'medium',
});

export function ViolationsTable({ items }: { items: Violation[] }) {
  const [worker, setWorker] = useState('');
  const [tool, setTool] = useState('');
  const [eventType, setEventType] = useState('');

  const workers = useMemo(() => [...new Set(items.map((v) => v.workerId))].sort(), [items]);
  const tools = useMemo(() => [...new Set(items.map((v) => v.toolId))].sort(), [items]);

  const rows = items.filter(
    (v) =>
      (!worker || v.workerId === worker) &&
      (!tool || v.toolId === tool) &&
      (!eventType || v.eventType === eventType),
  );

  return (
    <section className="panel" aria-labelledby="violations-title">
      <header className="panel__head">
        <div>
          <h2 id="violations-title">Violation log</h2>
          <p className="panel__hint">
            {rows.length} of {items.length} events · newest first
          </p>
        </div>
        <div className="filters">
          <label>
            Worker
            <select value={worker} onChange={(e) => setWorker(e.target.value)}>
              <option value="">All</option>
              {workers.map((w) => (
                <option key={w}>{w}</option>
              ))}
            </select>
          </label>
          <label>
            Tool
            <select value={tool} onChange={(e) => setTool(e.target.value)}>
              <option value="">All</option>
              {tools.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Event
            <select value={eventType} onChange={(e) => setEventType(e.target.value)}>
              <option value="">All</option>
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EVENT_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="empty">No violations recorded.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Worker</th>
                <th scope="col">Tool</th>
                <th scope="col">Helmet</th>
                <th scope="col">Event</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id}>
                  <td className="mono">{timeFmt.format(new Date(v.serverTs))}</td>
                  <td>{v.workerId}</td>
                  <td>{v.toolId}</td>
                  <td>{v.deviceId}</td>
                  <td>
                    <span className={`chip chip--${v.eventType === 'HELMET_REMOVED' ? 'danger' : 'warn'}`}>
                      {EVENT_LABEL[v.eventType]}
                    </span>
                  </td>
                  <td>{ACTION_LABEL[v.action]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
