import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Store } from '@/domain/store/store';
import { StoreContext } from '@/domain/store/hooks';
import { SessionProvider } from '@/app/session';
import { ToastProvider } from '@/app/shared/ui';
import App from '@/App';
import '@/styles/index.css';

const store = new Store();
// Expose for debugging / e2e scripts (read-only use intended)
(window as unknown as { gomaxi: Store }).gomaxi = store;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StoreContext.Provider value={store}>
      <SessionProvider>
        <ToastProvider>
          <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <App />
          </BrowserRouter>
        </ToastProvider>
      </SessionProvider>
    </StoreContext.Provider>
  </React.StrictMode>,
);
