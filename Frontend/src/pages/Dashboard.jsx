import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { io } from 'socket.io-client';
import { AlertCircle, AlertTriangle, CheckCircle, Activity, Filter } from 'lucide-react';

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

  const [filters, setFilters] = useState({
    status: '',
    severity: '',
    service: '',
    assignee: ''
  });

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
    
    fetchDashboard(); // Initial load

    const socket = io('http://localhost:4000');
    socket.on('dashboard_updated', () => {
      fetchDashboard(); // Silently refresh the list when someone updates an incident
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const uniqueServices = useMemo(() => {
    return [...new Set(data.incidents.map(inc => inc.service_name).filter(Boolean))];
  }, [data.incidents]);

  const uniqueAssignees = useMemo(() => {
    return [...new Set(data.incidents.map(inc => inc.assigned_to_name).filter(Boolean))];
  }, [data.incidents]);

  const filteredIncidents = useMemo(() => {
    return data.incidents.filter((inc) => {
      const matchStatus = !filters.status || inc.status === filters.status;
      const matchSeverity = !filters.severity || inc.severity === filters.severity;
      const matchService = !filters.service || inc.service_name === filters.service;
      
      let matchAssignee = true;
      if (filters.assignee === 'Unassigned') {
        matchAssignee = !inc.assigned_to_name;
      } else if (filters.assignee) {
        matchAssignee = inc.assigned_to_name === filters.assignee;
      }

      return matchStatus && matchSeverity && matchService && matchAssignee;
    });
  }, [data.incidents, filters]);

  const handleFilterChange = (e) => {
    setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const clearFilters = () => {
    setFilters({ status: '', severity: '', service: '', assignee: '' });
  };

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

        {/* Filter Bar */}
        <div className="px-6 py-3 border-b border-slate-200 bg-white flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2 text-sm text-slate-500 font-medium mr-2">
            <Filter className="w-4 h-4" /> Filters:
          </div>
          
          <select name="status" value={filters.status} onChange={handleFilterChange} className="text-sm border border-slate-300 rounded px-2 py-1.5 bg-slate-50 outline-none focus:ring-1 focus:ring-primary-500">
            <option value="">All Statuses</option>
            <option value="OPEN">OPEN</option>
            <option value="INVESTIGATING">INVESTIGATING</option>
            <option value="MONITORING">MONITORING</option>
            <option value="RESOLVED">RESOLVED</option>
          </select>

          <select name="severity" value={filters.severity} onChange={handleFilterChange} className="text-sm border border-slate-300 rounded px-2 py-1.5 bg-slate-50 outline-none focus:ring-1 focus:ring-primary-500">
            <option value="">All Severities</option>
            <option value="CRITICAL">CRITICAL</option>
            <option value="HIGH">HIGH</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="LOW">LOW</option>
          </select>

          <select name="service" value={filters.service} onChange={handleFilterChange} className="text-sm border border-slate-300 rounded px-2 py-1.5 bg-slate-50 outline-none focus:ring-1 focus:ring-primary-500">
            <option value="">All Services</option>
            {uniqueServices.map(srv => <option key={srv} value={srv}>{srv}</option>)}
          </select>

          <select name="assignee" value={filters.assignee} onChange={handleFilterChange} className="text-sm border border-slate-300 rounded px-2 py-1.5 bg-slate-50 outline-none focus:ring-1 focus:ring-primary-500">
            <option value="">All Assignees</option>
            <option value="Unassigned">Unassigned Only</option>
            {uniqueAssignees.map(user => <option key={user} value={user}>{user}</option>)}
          </select>

          {Object.values(filters).some(v => v !== '') && (
            <button onClick={clearFilters} className="text-sm text-primary-600 hover:underline ml-2">
              Clear All
            </button>
          )}
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
                <th className="px-6 py-3 font-medium">Assignee</th>
                <th className="px-6 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {filteredIncidents.map((inc) => (
                <tr key={inc.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap font-medium text-primary-600">
                    <Link to={`/incidents/${inc.id}`} className="hover:underline">{inc.code}</Link>
                  </td>
                  <td className="px-6 py-4 text-slate-800">{inc.title}</td>
                  <td className="px-6 py-4 whitespace-nowrap"><Badge type={inc.severity}>{inc.severity}</Badge></td>
                  <td className="px-6 py-4 whitespace-nowrap"><Badge type={inc.status}>{inc.status}</Badge></td>
                  <td className="px-6 py-4 whitespace-nowrap text-slate-600">{inc.service_name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-slate-600">
                    {inc.assigned_to_name || <span className="text-slate-400 italic">Unassigned</span>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-slate-500">
                    {new Date(inc.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                </tr>
              ))}
              {filteredIncidents.length === 0 && (
                <tr>
                  <td colSpan="7" className="px-6 py-8 text-center text-slate-500">
                    No incidents match the selected filters.
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