import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import CollectPage from './pages/CollectPage';
import CleanPage from './pages/CleanPage';
import TrainPage from './pages/TrainPage';
import PlayPage from './pages/PlayPage';
import SettingsPage from './pages/SettingsPage';

// Icon components
const CollectIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const CleanIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </svg>
);

const TrainIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);

const PlayIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);

const SettingsIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
);

function App() {
  return (
    <BrowserRouter>
      <div className="flex w-full h-screen" data-theme="nuclear">
        {/* Sidebar */}
        <aside className="w-56 bg-base-200 border-r border-base-300 flex flex-col">
          {/* Header */}
          <div className="px-4 py-4 border-b border-base-300">
            <h1 className="text-lg font-semibold text-primary">NTB-Redux</h1>
            <span className="text-xs text-base-content/60">Training & Inference</span>
          </div>

          {/* Navigation */}
          <ul className="menu menu-md p-2 gap-1 flex-1">
            <li>
              <NavLink to="/" className={({ isActive }) => (isActive ? 'active' : '')}>
                <CollectIcon />
                Collect Data
              </NavLink>
            </li>
            <li>
              <NavLink to="/clean" className={({ isActive }) => (isActive ? 'active' : '')}>
                <CleanIcon />
                Clean Data
              </NavLink>
            </li>
            <li>
              <NavLink to="/train" className={({ isActive }) => (isActive ? 'active' : '')}>
                <TrainIcon />
                Train Model
              </NavLink>
            </li>
            <li>
              <NavLink to="/play" className={({ isActive }) => (isActive ? 'active' : '')}>
                <PlayIcon />
                Run Agent
              </NavLink>
            </li>
            <li>
              <NavLink to="/settings" className={({ isActive }) => (isActive ? 'active' : '')}>
                <SettingsIcon />
                Settings
              </NavLink>
            </li>
          </ul>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 overflow-y-auto bg-base-100">
          <Routes>
            <Route path="/" element={<CollectPage />} />
            <Route path="/clean" element={<CleanPage />} />
            <Route path="/train" element={<TrainPage />} />
            <Route path="/play" element={<PlayPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
