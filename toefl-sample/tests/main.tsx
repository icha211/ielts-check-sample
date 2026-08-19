import React from 'react';
import ReactDOM from 'react-dom/client';
import './global.css';
import MyProgress from '../MyProgress';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MyProgress />
  </React.StrictMode>
);