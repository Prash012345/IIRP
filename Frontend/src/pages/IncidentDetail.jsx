import { useEffect, useState, useContext, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import api from '../services/api';
import { AuthContext } from '../contexts/AuthContext';
import { Clock, AlertTriangle, MessageSquare, Activity, Users, Send } from 'lucide-react';

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

  useEffect(() => {
    // 1. Fetch initial data
    const fetchIncident = async () => {
      try {
        const res = await api.get(`/incidents/${id}`);
        setData(res.data);
      } catch (err) {
        console.error('Error fetching incident', err);
      } finally {
        setLoading(false);
      }
    };
    fetchIncident();

    // 2. Setup WebSockets for Real-Time Collaboration (Requirement 5)
    socketRef.current = io('http://localhost:4000');
    
    socketRef.current.emit('join_incident', { incidentId: id, user: { id: user.id, name: user.name } });

    socketRef.current.on('presence_updated', (users) => {
      setActiveUsers(users);
    });

    socketRef.current.on('timeline_event_added', (newEvent) => {
      setData((prev) => ({
        ...prev,
        timeline: [...prev.timeline, newEvent]
      }));
    });

    socketRef.current.on('incident_updated', (updates) => {
      setData((prev) => ({
        ...prev,
        incident: { ...prev.incident, ...updates }
      }));
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
      // Note: We don't manually update the timeline array here! 
      // The WebSocket will broadcast the event back to us and everyone else automatically.
    } catch (err) {
      console.error('Failed to post comment', err);
    }
  };

  if (loading) return <div className="p-8 text-center">Loading incident details...</div>;
  if (!data.incident) return <div className="p-8 text-center text-danger">Incident not found</div>;

  const { incident, timeline, correlatedDeployments } = data;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      {/* Left Column: Details & Timeline */}
      <div className="lg:col-span-2 space-y-6">
        
        {/* Incident Header Card */}
        <div className="bg-surface rounded-lg shadow-sm border border-slate-200 p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                {incident.code}: {incident.title}
              </h1>
              <p className="text-slate-500 mt-1">Reported {new Date(incident.created_at).toLocaleString()}</p>
            </div>
            <div className="flex gap-2 items-center">
              <select 
                className="text-xs border rounded p-1 bg-slate-50"
                value={incident.severity}
                onChange={(e) => api.patch(`/incidents/${id}`, { severity: e.target.value })}
              >
                <option value="CRITICAL">CRITICAL</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
              </select>
              <select 
                className="text-xs border rounded p-1 bg-slate-50"
                value={incident.status}
                onChange={(e) => api.patch(`/incidents/${id}`, { status: e.target.value })}
              >
                <option value="OPEN">OPEN</option>
                <option value="INVESTIGATING">INVESTIGATING</option>
                <option value="MONITORING">MONITORING</option>
                <option value="RESOLVED">RESOLVED</option>
              </select>
            </div>
          </div>
          <p className="text-slate-700 whitespace-pre-wrap">{incident.description}</p>
        </div>

        {/* Evidence Timeline */}
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
                  {event.metadata && (
                    <pre className="mt-2 bg-slate-100 p-2 rounded text-xs text-slate-700 overflow-x-auto border border-slate-200">
                      {JSON.stringify(event.metadata, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Add Note Form */}
          <form onSubmit={handleAddComment} className="mt-8 flex gap-2 border-t border-slate-200 pt-6">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add an investigation note or comment..."
              className="flex-1 px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <button type="submit" className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 flex items-center gap-2">
              <Send className="w-4 h-4"/> Post
            </button>
          </form>
        </div>
      </div>

      {/* Right Column: Context & Metadata */}
      <div className="space-y-6">
        
        {/* Real-time Presence */}
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

        {/* Affected Service Info */}
        <div className="bg-surface rounded-lg shadow-sm border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">Affected Service</h2>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded text-sm">
            <div className="font-medium text-slate-800">{incident.service_name}</div>
            <div className="text-slate-500 mt-1">Status: {incident.service_status}</div>
          </div>
        </div>

        {/* Deployment Correlation (Requirement 3) */}
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