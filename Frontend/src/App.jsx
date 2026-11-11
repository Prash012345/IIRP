import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, AuthContext } from './contexts/AuthContext';
import { useContext } from 'react';
import Layout from './components/Layout';

// Import actual pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import NewIncident from './pages/NewIncident';
import IncidentDetail from './pages/IncidentDetail';
import Deployments from './pages/Deployments';
import Services from './pages/Services';
import Report from './pages/Report';

const IncidentsList = () => <Navigate to="/" replace />;

// Protected Route Wrapper
const ProtectedRoute = ({ children }) => {
  const { user } = useContext(AuthContext);
  if (!user) return <Navigate to="/login" replace />;
  return children;
};

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="incidents" element={<IncidentsList />} />
            <Route path="incidents/new" element={<NewIncident />} />
            <Route path="incidents/:id" element={<IncidentDetail />} />
            <Route path="incidents/:id/report" element={<Report />} />
            <Route path="deployments" element={<Deployments />} />
            <Route path="services" element={<Services />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}