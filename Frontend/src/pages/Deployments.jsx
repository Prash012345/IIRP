import { useEffect, useState } from 'react';
import api from '../services/api';
import { Rocket } from 'lucide-react';

export default function Deployments() {
  const [deployments, setDeployments] = useState([]);
  const [services, setServices] = useState([]);
  const [formData, setFormData] = useState({ version: '', serviceId: '', description: '' });

  useEffect(() => {
    api.get('/deployments').then(res => setDeployments(res.data));
    api.get('/services/graph').then(res => setServices(res.data.services));
  }, []);

  const handlePost = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/deployments', { ...formData, serviceId: Number(formData.serviceId) });
      setDeployments([res.data, ...deployments]);
      setFormData({ version: '', serviceId: '', description: '' });
    } catch (err) { alert('Error adding deployment'); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 bg-surface p-6 rounded-lg border">
        <h1 className="text-xl font-bold mb-4 flex items-center gap-2"><Rocket className="w-5 h-5"/> Deployment History</h1>
        <table className="w-full text-left text-sm border-collapse">
          <thead><tr className="border-b text-slate-500"><th className="py-2">Version</th><th className="py-2">Service</th><th className="py-2">Deployed At</th></tr></thead>
          <tbody>
            {deployments.map(d => (
              <tr key={d.id} className="border-b">
                <td className="py-3 font-medium text-slate-800">{d.version}</td>
                <td className="py-3 text-slate-600">{d.service_name}</td>
                <td className="py-3 text-slate-500">{new Date(d.deployed_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="bg-surface p-6 rounded-lg border h-fit">
        <h2 className="text-lg font-bold mb-4">Record Deployment</h2>
        <form onSubmit={handlePost} className="space-y-4">
          <input required type="text" placeholder="Version (e.g. v2.4.2)" className="w-full px-3 py-2 border rounded" value={formData.version} onChange={e => setFormData({...formData, version: e.target.value})} />
          <select required className="w-full px-3 py-2 border rounded" value={formData.serviceId} onChange={e => setFormData({...formData, serviceId: e.target.value})}>
            <option value="">Select Service...</option>
            {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <textarea placeholder="Changelog / Description" className="w-full px-3 py-2 border rounded" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
          <button type="submit" className="w-full bg-primary-600 text-white py-2 rounded">Add Deployment</button>
        </form>
      </div>
    </div>
  );
}