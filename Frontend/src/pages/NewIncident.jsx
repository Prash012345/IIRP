import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Activity } from 'lucide-react';

export default function NewIncident() {
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '', description: '', category: 'Backend', severity: 'MEDIUM', serviceId: '', assignedToId: ''
  });

  useEffect(() => {
    const fetchData = async () => {
      const [svcRes, userRes] = await Promise.all([api.get('/services/graph'), api.get('/users')]);
      setServices(svcRes.data.services);
      setUsers(userRes.data);
    };
    fetchData();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...formData,
        serviceId: Number(formData.serviceId),
        assignedToId: formData.assignedToId ? Number(formData.assignedToId) : null,
      };
      const res = await api.post('/incidents', payload);
      navigate(`/incidents/${res.data.id}`);
    } catch (err) {
      console.error(err);
      alert('Failed to create incident');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto bg-surface rounded-lg shadow-sm border border-slate-200 p-6">
      <h1 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
        <Activity className="w-6 h-6 text-primary-600"/> Declare New Incident
      </h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Title</label>
          <input type="text" required className="w-full px-3 py-2 border rounded-md" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea className="w-full px-3 py-2 border rounded-md" rows="3" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})}></textarea>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Affected Service</label>
            <select required className="w-full px-3 py-2 border rounded-md" value={formData.serviceId} onChange={e => setFormData({...formData, serviceId: e.target.value})}>
              <option value="">Select Service...</option>
              {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Severity</label>
            <select className="w-full px-3 py-2 border rounded-md" value={formData.severity} onChange={e => setFormData({...formData, severity: e.target.value})}>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Category</label>
            <input type="text" className="w-full px-3 py-2 border rounded-md" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Assignee (Optional)</label>
            <select className="w-full px-3 py-2 border rounded-md" value={formData.assignedToId} onChange={e => setFormData({...formData, assignedToId: e.target.value})}>
              <option value="">Unassigned</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
            </select>
          </div>
        </div>
        <button type="submit" disabled={loading} className="w-full bg-primary-600 text-white py-2 rounded-md hover:bg-primary-700 mt-4">
          {loading ? 'Declaring...' : 'Create Incident'}
        </button>
      </form>
    </div>
  );
}