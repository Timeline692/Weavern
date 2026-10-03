import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { useStore } from './store';
import App from './App';
import './index.css';

function Root() {
  const darkMode = useStore(s => s.darkMode);

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: darkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: darkMode ? '#e0b35e' : '#126d82',
          colorText: darkMode ? '#edf1ed' : '#172b35',
          colorTextSecondary: darkMode ? '#aebbc0' : '#60717a',
          colorBgContainer: darkMode ? '#152630' : '#faf8f4',
          colorBorder: darkMode ? '#344650' : '#d9d8d1',
          borderRadius: 5,
          fontFamily: '"Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
        },
      }}
    >
      <App />
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
