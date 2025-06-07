import { useState, useEffect } from 'react'
import Login from './components/Login'
import Register from './components/Register'
import Dashboard from './components/Dashboard'
import './App.css'

function App() {
  const [token, setToken] = useState(null)
  const [view, setView] = useState('login') // 'login', 'register'

  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    if (storedToken) {
      setToken(storedToken)
    }
  }, [])

  const handleLogout = () => {
    setToken(null)
    localStorage.removeItem('token')
    setView('login')
  }

  if (token) {
    return <Dashboard token={token} onLogout={handleLogout} />
  }

  return (
    <div className="container">
      {view === 'login' ? (
        <Login setToken={setToken} />
      ) : (
        <Register setToken={setToken} />
      )}
      <button className="toggle-button" onClick={() => setView(view === 'login' ? 'register' : 'login')}>
        {view === 'login' ? "Pas de compte ? S'inscrire" : "Déjà un compte ? Se connecter"}
      </button>
    </div>
  )
}

export default App
