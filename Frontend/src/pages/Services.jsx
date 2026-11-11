import { useEffect, useState } from 'react';
import api from '../services/api';
import { Server, ArrowDownRight, AlertCircle, CheckCircle } from 'lucide-react';
import ServiceGraph from '../components/ServiceGraph';

export default function Services() {
  const [data, setData] = useState({ services: [], impactByService: {} });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGraph = async () => {
      try {
        const res = await api.get('/services/graph');
        setData(res.data);
      } catch (err) {
        console.error('Failed to fetch services graph', err);
      } finally {
        setLoading(false);
      }
    };
    fetchGraph();
  }, []);

  if (loading) return <div className="p-8 text-center text-slate-500">Loading services...</div>;

  const { services, dependencies, impactByService } = data;

  const getStatusColor = (status) => {
    switch (status) {
      case 'HEALTHY': return 'text-green-600 bg-green-50 border-green-200';
      case 'DEGRADED': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'UNAVAILABLE': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-slate-600 bg-slate-50 border-slate-200';
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Service Portfolio</h1>
        <p className="text-slate-500">Overview of all services and their current health status.</p>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {services.map((service) => (
          <div key={service.id} className={`p-5 rounded-lg border shadow-sm flex items-start gap-4 ${getStatusColor(service.status)}`}>
            <div className="mt-1">
              {service.status === 'HEALTHY' ? <CheckCircle className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
            </div>
            <div>
              <h3 className="font-bold text-lg">{service.name}</h3>
              <p className="text-sm opacity-80 mt-1">{service.description}</p>
              <div className="mt-3 text-xs font-semibold uppercase tracking-wider">
                Status: {service.status}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Dependancy Graph */}
      <div className="mt-8">
        <h2 className="text-xl font-bold text-slate-800 mb-4">Architecture Map</h2>
        <ServiceGraph services={services} dependencies={dependencies} />
      </div>

      {/* Dependency Impact Analysis */}
      {Object.keys(impactByService).length > 0 && (
        <div className="mt-12">
          <h2 className="text-xl font-bold text-slate-800 mb-6 border-b pb-2">Active Impact Analysis</h2>
          
          <div className="space-y-6">
            {Object.values(impactByService).map(({ service, directlyAffected, potentiallyAffected }) => (
              <div key={service.id} className="bg-surface rounded-lg border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <span className="bg-red-100 text-red-800 text-xs font-bold px-2 py-1 rounded">Root</span>
                  <h3 className="text-lg font-bold text-slate-800">{service.name} is {service.status}</h3>
                </div>
                
                <div className="pl-4 md:pl-8 space-y-4 border-l-2 border-slate-200 ml-2 md:ml-4">
                  
                  {/* Directly Affected (1 hop) */}
                  {directlyAffected.length > 0 && (
                    <div className="relative">
                      <ArrowDownRight className="w-5 h-5 text-slate-400 absolute -left-9 md:-left-13 top-0" />
                      <h4 className="text-sm font-semibold text-slate-700 mb-2">Directly Affected (Downstream)</h4>
                      <div className="flex flex-wrap gap-2">
                        {directlyAffected.map(dep => (
                          <div key={dep.id} className="px-3 py-1.5 bg-orange-50 border border-orange-200 text-orange-800 rounded text-sm font-medium">
                            {dep.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Potentially Affected (2+ hops) */}
                  {potentiallyAffected.length > 0 && (
                    <div className="relative">
                      <ArrowDownRight className="w-5 h-5 text-slate-400 absolute -left-9 md:-left-13 top-0" />
                      <h4 className="text-sm font-semibold text-slate-700 mb-2">Potentially Affected (Cascading)</h4>
                      <div className="flex flex-wrap gap-2">
                        {potentiallyAffected.map(dep => (
                          <div key={dep.id} className="px-3 py-1.5 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded text-sm font-medium">
                            {dep.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {directlyAffected.length === 0 && potentiallyAffected.length === 0 && (
                    <p className="text-sm text-slate-500">No downstream services are affected by this component.</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}