import Sidebar from './components/sidebar/sidebar';
import AppRoutes from './routes/AppRoutes';

function App() {
  return (
    <div style={{ display: 'flex' }}>
      <Sidebar />
      <div style={{ flex: 1, padding: '20px' }}>
        <AppRoutes />
      </div>
    </div>
  );
}

export default App;
