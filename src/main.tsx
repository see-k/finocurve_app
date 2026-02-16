import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { ThemeProvider } from './theme/ThemeContext'
import './theme/theme.css'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <ThemeProvider>
        <div className="global-titlebar-drag" />
        <App />
      </ThemeProvider>
    </HashRouter>
  </React.StrictMode>,
)
