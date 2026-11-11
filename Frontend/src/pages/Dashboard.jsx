import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { AlertCircle, AlertTriangle, CheckCircle, Activity } from 'lucide-react';

// Helper component for classic status badges
const Badge = ({ children, type }) => {
  const styles = {
    CRITICAL: 'bg-red-100 text-red-800 border-red-200',
    HIGH: 'bg-orange-100 text-orange-800 border-orange-200',
    MEDIUM: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    LOW: 'bg-slate-100 text-slate-800 border-slate-200',
    OPEN: 'bg-blue-100 text-blue-800 border-blue-200',
    INVESTIGATING: 'bg-purple-100 text-purple-800 border-purple-200',
    MONITORING: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    RESOLVED: 'bg-green-100 text-green-800 border-green-200',
  };
  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full border ${styles[type] || styles.LOW}`}>
      {children}
    </span>
  );
};

export default function Dashboard() {
  const [data, setData] = useState({ summary: {}, incidents: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const res = await api.get('/incidents');
        setData(res.data);
      } catch (err) {
        console.error('Failed to fetch dashboard data', err);
      } finally {
        setLoading(false);
      }
    };
    fetchDashboard();
  }, []);

  if (loading) return <div className="p-8 text-center text-slate-500">Loading dashboard...</div>;

  const { summary, incidents } = data;

  const statCards = [
    { label: 'Open Incidents', value: summary.openTotal || 0, icon: Activity, color: 'text-blue-600' },
    { label: 'Critical Severity', value: summary.critical || 0, icon: AlertCircle, color: 'text-red-600' },
    { label: 'Currently Investigating', value: summary.investigating || 0, icon: AlertTriangle, color: 'text-purple-600' },
    { label: 'Resolved (All Time)', value: summary.resolved || 0, icon: CheckCircle, color: 'text-green-600' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Overview</h1>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div key={idx} className="bg-surface rounded-lg shadow-sm border border-slate-200 p-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{stat.value}</p>
              </div>
              <div className={`p-3 rounded-full bg-slate-50 ${stat.color}`}>
                <Icon className="w-6 h-6" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent Incidents Table */}
      <div className="bg-surface rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <h2 className="text-lg font-semibold text-slate-800">Recent Incidents</h2>
          <Link to="/incidents/new" className="bg-primary-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-primary-700">
            + New Incident
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="px-6 py-3 font-medium">Code</th>
                <th className="px-6 py-3 font-medium">Title</th>
                <th className="px-6 py-3 font-medium">Severity</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Service</th>
                <th className="px-6 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {incidents.slice(0, 10).map((inc) => (
                <tr key={inc.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap font-medium text-primary-600">
                    <Link to={`/incidents/${inc.id}`} className="hover:underline">{inc.code}</Link>
                  </td>
                  <td className="px-6 py-4 text-slate-800">{inc.title}</td>
                  <td className="px-6 py-4 whitespace-nowrap"><Badge type={inc.severity}>{inc.severity}</Badge></td>
                  <td className="px-6 py-4 whitespace-nowrap"><Badge type={inc.status}>{inc.status}</Badge></td>
                  <td className="px-6 py-4 whitespace-nowrap text-slate-600">{inc.service_name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-slate-500">
                    {new Date(inc.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                </tr>
              ))}
              {incidents.length === 0 && (
                <tr>
                  <td colSpan="6" className="px-6 py-8 text-center text-slate-500">
                    No incidents found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}