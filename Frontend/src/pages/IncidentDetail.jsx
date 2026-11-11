import { useEffect, useState, useContext, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import api from '../services/api';
import { AuthContext } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import { Clock, AlertTriangle, MessageSquare, Activity, Users, Send, FileText } from 'lucide-react';

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

export default function IncidentDetail() {
  const { id } = useParams();
  const { user } = useContext(AuthContext);
  const [data, setData] = useState({ incident: null, timeline: [], correlatedDeployments: [] });
  const [activeUsers, setActiveUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const socketRef = useRef(null);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [incidentRes, usersRes] = await Promise.all([
          api.get(`/incidents/${id}`),
          api.get('/users')
        ]);
        setData(incidentRes.data);
        setUsers(usersRes.data);
      } catch (err) {
        console.error('Error fetching data', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();

    socketRef.current = io('http://localhost:4000');
    
    socketRef.current.emit('join_incident', { incidentId: id, user: { id: user.id, name: user.name } });

    socketRef.current.on('presence_updated', (users) => {
      const uniqueUsers = Array.from(new Map(users.map(u => [u.id, u])).values());
      setActiveUsers(uniqueUsers);
    });

    socketRef.current.on('timeline_event_added', (newEvent) => {
      setData((prev) => ({
        ...prev,
        timeline: [...prev.timeline, newEvent]
      }));
    });

    socketRef.current.on('incident_updated', async () => {
      try {
        const res = await api.get(`/incidents/${id}`);
        setData(res.data);
      } catch (err) {
        console.error('Failed to sync incident update', err);
      }
    });

    return () => {
      socketRef.current.emit('leave_incident', { incidentId: id });
      socketRef.current.disconnect();
    };
  }, [id, user]);

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    try {
      await api.post(`/incidents/${id}/events`, {
        type: 'COMMENT',
        title: 'Engineer Note',
        description: newComment,
        idempotencyKey: `comment-${Date.now()}-${user.id}`
      });
      setNewComment('');
    } catch (err) {
      console.error('Failed to post comment', err);
    }
  };

  const handleUpdateIncident = async (field, value) => {
    setData((prev) => ({
      ...prev,
      incident: { ...prev.incident, [field]: value }
    }));
    
    try {
      await api.patch(`/incidents/${id}`, { [field]: value });
      
      const res = await api.get(`/incidents/${id}`);
      setData(res.data);
    } catch (err) {
      console.error('Failed to update incident', err);
    }
  };

  if (loading) return <div className="p-8 text-center">Loading incident details...</div>;
  if (!data.incident) return <div className="p-8 text-center text-danger">Incident not found</div>;

  const { incident, timeline, correlatedDeployments } = data;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      <div className="lg:col-span-2 space-y-6">
        
        <div className="bg-surface rounded-lg shadow-sm border border-slate-200 p-6">
          <div className="flex flex-col md:flex-row justify-between items-start mb-4 gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                {incident.code}: {incident.title}
              </h1>
              <p className="text-slate-500 mt-1">Reported {new Date(incident.created_at).toLocaleString()}</p>
            </div>
            
            <div className="flex flex-col items-end gap-3">
              <div className="flex gap-2 items-center">
                <select
                  className="text-xs border rounded p-1 bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed font-semibold"
                  value={incident.assigned_to_id || ''}
                  onChange={(e) => handleUpdateIncident('assignedToId', e.target.value === '' ? null : Number(e.target.value))}
                  disabled={user?.role !== 'ADMIN' || incident.status === 'RESOLVED'}
                  title={user?.role !== 'ADMIN' ? "Only Administrators can reassign tickets" : "Reassign Incident"}
                >
                  <option value="">Unassigned</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
                <select 
                  className="text-xs border rounded p-1 bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed font-semibold"
                  value={incident.severity}
                  onChange={(e) => handleUpdateIncident('severity', e.target.value)}
                  disabled={incident.status === 'RESOLVED'}
                >
                  <option value="CRITICAL">CRITICAL</option>
                  <option value="HIGH">HIGH</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="LOW">LOW</option>
                </select>
                <select 
                  className="text-xs border rounded p-1 bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed font-semibold"
                  value={incident.status}
                  onChange={(e) => handleUpdateIncident('status', e.target.value)}
                  disabled={incident.status === 'RESOLVED'}
                >
                  <option value="OPEN">OPEN</option>
                  <option value="INVESTIGATING">INVESTIGATING</option>
                  <option value="MONITORING">MONITORING</option>
                  <option value="RESOLVED">RESOLVED</option>
                </select>
              </div>

              {incident.status === 'RESOLVED' && (
                <Link 
                  to={`/incidents/${id}/report`}
                  className="bg-slate-800 text-white px-3 py-1.5 rounded flex items-center gap-2 text-sm font-medium hover:bg-slate-700 transition-colors shadow-sm"
                >
                  <FileText className="w-4 h-4" /> Post-Incident Report
                </Link>
              )}
            </div>
          </div>
          
          <p className="text-slate-700 whitespace-pre-wrap">{incident.description && (
            <div className="mt-6 mb-4 p-4 bg-slate-50 border border-slate-100 rounded-md">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Issue Description</h3>
              <p className="text-slate-700 whitespace-pre-wrap text-sm">{incident.description}</p>
            </div>
          )}</p>
          
          {incident.status === 'RESOLVED' && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 text-green-800 text-sm rounded-md flex items-center gap-2">
              <Clock className="w-4 h-4" /> This incident has been resolved and the investigation timeline is now frozen.
            </div>
          )}
        </div>

        <div className="bg-surface rounded-lg shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5"/> Investigation Timeline
          </h2>
          
          <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-slate-200">
            {timeline.map((event) => (
              <div key={event.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-primary-100 text-primary-600 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                  {event.type === 'COMMENT' ? <MessageSquare className="w-4 h-4"/> : <Clock className="w-4 h-4"/>}
                </div>
                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-slate-50 p-4 rounded border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-center mb-1">
                    <h3 className="font-bold text-slate-800 text-sm">{event.title}</h3>
                    <time className="text-xs text-slate-500">{new Date(event.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                  </div>
                  
                  <p className="text-slate-600 text-sm">{event.description}</p>
                  {event.user_name && (
                    <p className="text-xs font-medium text-slate-500 mb-1">
                      By {event.user_name} {event.user_title ? `(${event.user_title})` : ''}
                    </p>
                  )}
                  
                  
                  {event.metadata && (
                    <pre className="mt-2 bg-slate-100 p-2 rounded text-xs text-slate-700 overflow-x-auto border border-slate-200">
                      {JSON.stringify(event.metadata, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={handleAddComment} className="mt-8 flex gap-2 border-t border-slate-200 pt-6">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              disabled={incident.status === 'RESOLVED'}
              placeholder={incident.status === 'RESOLVED' ? "Investigation is closed." : "Add an investigation note or comment..."}
              className="flex-1 px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
            />
            <button 
              type="submit" 
              disabled={incident.status === 'RESOLVED'} 
              className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4"/> Post
            </button>
          </form>
        </div>
      </div>

      <div className="space-y-6">
        
        <div className="bg-surface rounded-lg shadow-sm border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <Users className="w-4 h-4"/> Active Investigators
          </h2>
          <ul className="space-y-2">
            {activeUsers.map((u, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-slate-600">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                {u.name} {u.id === user.id && '(You)'}
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-surface rounded-lg shadow-sm border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">Affected Service</h2>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded text-sm">
            <div className="font-medium text-slate-800">{incident.service_name}</div>
            <div className="text-slate-500 mt-1">Status: {incident.service_status}</div>
          </div>
        </div>

        {/* Deployment Correlation */}
        <div className="bg-surface rounded-lg shadow-sm border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-warning"/> Correlated Deployments
          </h2>
          {correlatedDeployments.length > 0 ? (
            <div className="space-y-3">
              {correlatedDeployments.map(dep => (
                <div key={dep.id} className="p-3 bg-orange-50 border border-orange-200 rounded text-sm">
                  <div className="font-medium text-orange-900">{dep.version}</div>
                  <div className="text-orange-700 mt-1">{dep.explanation}</div>
                  <div className="text-xs text-orange-600 font-semibold mt-2">Suggested Unverified Root Cause</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No deployments detected within the correlation window prior to this incident.</p>
          )}
        </div>

      </div>
    </div>
  );
}