import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import { FileText, Download, ArrowLeft, CheckSquare, Square } from 'lucide-react';

export default function Report() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const res = await api.get(`/incidents/${id}/report`);
        setData(res.data);
      } catch (err) {
        console.error('Failed to fetch report', err);
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, [id]);

  if (loading) return <div className="p-8 text-center">Generating report...</div>;
  if (!data || !data.incident) return <div className="p-8 text-center text-danger">Report not found</div>;

  const { incident, report, actions, timeline, affectedServices } = data;

  const handleExportPDF = () => {
    window.print();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 print:m-0 print:p-0">
      
      {/* Non-printable Action Bar */}
      <div className="flex justify-between items-center print:hidden bg-surface p-4 rounded-lg border border-slate-200 shadow-sm">
        <Link to={`/incidents/${id}`} className="text-primary-600 hover:underline flex items-center gap-2 text-sm font-medium">
          <ArrowLeft className="w-4 h-4" /> Back to Incident
        </Link>
        <button 
          onClick={handleExportPDF}
          className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 flex items-center gap-2 text-sm font-medium"
        >
          <Download className="w-4 h-4" /> Export PDF
        </button>
      </div>

      {/* Printable Report Document */}
      <div className="bg-white p-8 md:p-12 rounded-lg border border-slate-200 shadow-sm print:border-none print:shadow-none">
        
        {/* Header */}
        <div className="border-b-2 border-slate-800 pb-6 mb-8 flex justify-between items-end">
          <div>
            <div className="flex items-center gap-2 mb-2 text-slate-500">
              <FileText className="w-5 h-5" />
              <span className="font-semibold uppercase tracking-wider text-sm">Post-Incident Review</span>
            </div>
            <h1 className="text-3xl font-bold text-slate-900">{incident.code}: {incident.title}</h1>
          </div>
          <div className="text-right text-sm text-slate-600">
            <p><strong>Date:</strong> {new Date(incident.created_at).toLocaleDateString()}</p>
            <p><strong>Severity:</strong> {incident.severity}</p>
            <p><strong>Status:</strong> {incident.status}</p>
          </div>
        </div>

        {/* Core Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-2">Executive Summary</h3>
            <p className="text-slate-700 text-sm leading-relaxed">{report.summary}</p>
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-2">Customer Impact</h3>
            <p className="text-slate-700 text-sm leading-relaxed">{report.impact}</p>
            <div className="mt-4">
              <strong className="text-sm text-slate-800 block mb-1">Affected Services:</strong>
              <div className="flex flex-wrap gap-1">
                {affectedServices.map(srv => (
                  <span key={srv} className="px-2 py-0.5 bg-slate-100 text-slate-700 text-xs rounded border border-slate-200">{srv}</span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Suspected Cause */}
        <div className="mb-10 p-4 bg-slate-50 border border-slate-200 rounded">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-2">Root Cause / Suspected Cause</h3>
          <p className="text-slate-700 text-sm">{report.suspected_cause}</p>
        </div>

        {/* Corrective Actions */}
        <div className="mb-10">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-200 pb-2">Corrective Actions</h3>
          <div className="space-y-3">
            {actions.length > 0 ? actions.map(action => (
              <div key={action.id} className="flex items-start gap-3">
                <div className="mt-0.5">
                  {action.status === 'COMPLETED' ? <CheckSquare className="w-5 h-5 text-green-600" /> : <Square className="w-5 h-5 text-slate-400" />}
                </div>
                <div>
                  <p className={`text-sm font-medium ${action.status === 'COMPLETED' ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                    {action.title}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Assigned to: {action.assignee_name || 'Unassigned'} • Status: {action.status}
                  </p>
                </div>
              </div>
            )) : <p className="text-sm text-slate-500">No corrective actions logged.</p>}
          </div>
        </div>

        {/* Timeline Summary */}
        <div>
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-200 pb-2">Key Investigation Events</h3>
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-slate-200">
              {timeline.filter(t => ['INCIDENT_CREATED', 'DEPLOYMENT_DETECTED', 'RECOVERY_ACTION', 'STATUS_CHANGE'].includes(t.type)).map(event => (
                <tr key={event.id}>
                  <td className="py-2 pr-4 text-slate-500 whitespace-nowrap align-top w-24">
                    {new Date(event.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="py-2 font-medium text-slate-800 align-top w-48">
                    {event.title}
                  </td>
                  <td className="py-2 text-slate-600 align-top">
                    {event.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}