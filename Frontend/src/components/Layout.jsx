import { useContext } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';
import { ShieldAlert, LogOut, LayoutDashboard, Server, Activity, Rocket, User } from 'lucide-react';

export default function Layout() {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navLinks = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Incidents', path: '/incidents', icon: Activity },
    { name: 'Deployments', path: '/deployments', icon: Rocket },
    { name: 'Services', path: '/services', icon: Server },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Navigation */}
      <header className="bg-primary-700 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2 font-bold text-xl">
              <ShieldAlert className="w-6 h-6 text-primary-100" />
              <span>IncidentOps</span>
            </Link>
            
            <nav className="hidden md:flex gap-1 ml-6">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive = location.pathname === link.path;
                return (
                  <Link
                    key={link.name}
                    to={link.path}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                      isActive ? 'bg-primary-600 text-white' : 'text-primary-100 hover:bg-primary-600'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {link.name}
                  </Link>
                );
              })}

              {user?.role === 'ADMIN' && (
             <Link
               to="/users/new"
               className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                 location.pathname === '/users/new' ? 'bg-primary-600 text-white' : 'text-primary-100 hover:bg-primary-600'
               }`}
             >
               <User className="w-4 h-4" />
               Manage User
             </Link>
           )}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-sm text-right hidden sm:block">
              <div className="font-semibold">{user?.name}</div>
              <div className="text-primary-200 text-xs">{user?.role}</div>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-primary-600 rounded-md transition-colors"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}