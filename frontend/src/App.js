import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Setup from './pages/Setup';
import LicenseBanner from './components/LicenseBanner';
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import ItemDetails from './pages/ItemDetails';
import GRN from './pages/GRN';
import SIV from './pages/SIV';
import Inventory from './pages/Inventory';
import CashReceipt from './pages/CashReceipt';
import PaymentVoucher from './pages/PaymentVoucher';
import CashBook from './pages/CashBook';
import AccountPayables from './pages/AccountPayables';
import Suppliers from './pages/Suppliers';
import Customers from './pages/Customers';
import Profile from './pages/Profile';
import Users from './pages/Users';
import SalesReport from './pages/SalesReport';
import SalesInventory from './pages/SalesInventory';
import CashReport from './pages/CashReport';
import StockAdjustment from './pages/StockAdjustment';
import Categories from './pages/Categories';
import BinCard from './pages/BinCard';
import SalesBinCard from './pages/SalesBinCard';
import Production from './pages/Production';
import SalesReturn from './pages/SalesReturn';
import Register from './pages/Register';

const isWeb = !navigator.userAgent.toLowerCase().includes('electron');

const PrivateRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div>Loading...</div>;
  return isAuthenticated ? children : <Navigate to="/login" />;
};

// Blocks page access if user lacks the required permission(s)
// perms: array of permission strings — user needs at least one
// adminOnly: true = only Administrators can access
const PermRoute = ({ children, perms = [], adminOnly = false }) => {
  const { user, hasPermission } = useAuth();
  if (!user) return <Navigate to="/login" />;
  const fallback = () => {
    if (!user) return '/login';
    const p = Array.isArray(user.permissions) ? user.permissions : [];
    const posOnly = p.includes('POS') && !p.includes('Full Access') && !broaderPerms.some(b => p.includes(b));
    return posOnly ? '/pos' : '/dashboard';
  };
  if (adminOnly && user.role !== 'Administrator') return <Navigate to={fallback()} />;
  if (perms.length > 0 && !perms.some(p => hasPermission(p))) return <Navigate to={fallback()} />;
  return children;
};

// Redirects to /pos if user only has POS permission, otherwise /dashboard
const broaderPerms = ['Sales','Stock','GRN','SIV','Accounting','Suppliers','Customers','Reports'];
const DefaultRedirect = () => {
  const { user } = useAuth();
  if (user && user.role !== 'Administrator') {
    const perms = Array.isArray(user.permissions) ? user.permissions : [];
    const isPOSOnly = perms.includes('POS') &&
      !perms.includes('Full Access') &&
      !broaderPerms.some(p => perms.includes(p));
    if (isPOSOnly) return <Navigate to="/pos" />;
  }
  return <Navigate to="/dashboard" />;
};

function AppRoutes() {
  const [syncChecked, setSyncChecked]     = useState(false);
  const [isConfigured, setIsConfigured]   = useState(true); // optimistic default
  const [licenseStatus, setLicenseStatus] = useState(null);
  const [trialStatus, setTrialStatus]     = useState(null);
  const [hasUsers, setHasUsers]           = useState(true); // optimistic default
  const { loginWithToken } = useAuth();

  useEffect(() => {
    fetch('/api/sync/status')
      .then(r => r.json())
      .then(async data => {
        setIsConfigured(!!data.isConfigured);
        if (data.isConfigured && data.tenantId && data.tenantId !== 'local-only') {
          // Cloud-registered: check license on VPS
          fetch(`https://butchery.sidanitsolutions.com/api/sync/license-status?tenantId=${data.tenantId}`)
            .then(r => r.json())
            .then(setLicenseStatus)
            .catch(() => {});
        } else {
          // Local-only / offline: enforce 14-day trial
          fetch('/api/sync/trial-status')
            .then(r => r.json())
            .then(setTrialStatus)
            .catch(() => {});
        }
        // Desktop only: check if any user account exists, auto-login if trial mode
        if (!isWeb && !localStorage.getItem('token')) {
          try {
            const acctRes = await fetch('/api/auth/account-status');
            const acct = await acctRes.json();
            setHasUsers(acct.hasUsers);
            if (!acct.hasUsers && !acct.isTrialExpired) {
              const tlRes = await fetch('/api/auth/trial-login', { method: 'POST' });
              const tlData = await tlRes.json();
              if (tlData.token) loginWithToken(tlData.token, tlData.user);
            }
          } catch (e) {}
        }
      })
      .catch(() => setIsConfigured(true))
      .finally(() => setSyncChecked(true));
  }, []); // eslint-disable-line

  if (!syncChecked) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
        <div style={{ fontSize: 32 }}>🥩</div>
      </div>
    );
  }

  if (!isConfigured) {
    return <Setup onComplete={() => setIsConfigured(true)} />;
  }

  // Cloud license expired — block access
  if (licenseStatus?.isExpired) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#fef2f2', padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🔒</div>
        <h1 style={{ color: '#dc2626', fontSize: 24, marginBottom: 8 }}>License Expired</h1>
        <p style={{ color: '#7f1d1d', fontSize: 15, maxWidth: 400 }}>
          Your Butchery Pro license expired on <strong>{licenseStatus.expiresAt?.substring(0,10)}</strong>.
          Please contact your software provider to renew your license.
        </p>
        <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 24 }}>
          Your data is safe and will be available once the license is renewed.
        </p>
      </div>
    );
  }

  // 14-day trial expired — if no account yet, let them register; otherwise block
  if (trialStatus?.trialApplicable && trialStatus?.isExpired) {
    if (!hasUsers) {
      return <Register onRegistered={() => setHasUsers(true)} />;
    }
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#fef2f2', padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🔒</div>
        <h1 style={{ color: '#dc2626', fontSize: 24, marginBottom: 8 }}>Trial Period Expired</h1>
        <p style={{ color: '#7f1d1d', fontSize: 15, maxWidth: 420 }}>
          Your 14-day free trial has ended. Contact SIDAN IT and Business Solutions to activate your license.
        </p>
        <p style={{ color: '#6b7280', fontSize: 13, marginTop: 16 }}>
          SIDAN IT and Business Solutions<br />
          +260 775 722 196 &nbsp;/&nbsp; +260 775 722 228<br />
          www.sidanitsolutions.com
        </p>
        <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 24 }}>
          Your data is safe and will be available once the license is activated.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <LicenseBanner licenseStatus={licenseStatus} trialStatus={trialStatus} hasUsers={hasUsers} />
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register onRegistered={() => setHasUsers(true)} />} />
      <Route path="/setup" element={<Setup onComplete={() => setIsConfigured(true)} />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<DefaultRedirect />} />
        <Route path="dashboard" element={<PermRoute perms={['Sales','Stock','GRN','SIV','Accounting','Suppliers','Customers','Reports']}><Dashboard /></PermRoute>} />
        <Route path="pos" element={<PermRoute perms={['POS','Sales']}><POS /></PermRoute>} />
        <Route path="pos/sales-report" element={<PermRoute perms={['Sales','Reports']}><SalesReport /></PermRoute>} />
        <Route path="pos/sales-inventory" element={<PermRoute perms={['Sales','Reports']}><SalesInventory /></PermRoute>} />
        <Route path="pos/cash-report" element={<PermRoute perms={['Sales','Reports']}><CashReport /></PermRoute>} />
        <Route path="pos/sales-bin-card" element={<PermRoute perms={['Sales','Reports']}><SalesBinCard /></PermRoute>} />
        <Route path="stock/items" element={<PermRoute perms={['Stock','GRN','SIV']}><ItemDetails /></PermRoute>} />
        <Route path="stock/grn" element={<PermRoute perms={['GRN','Stock']}><GRN /></PermRoute>} />
        <Route path="stock/siv" element={<PermRoute perms={['SIV','Stock']}><SIV /></PermRoute>} />
        <Route path="stock/inventory" element={<PermRoute perms={['Stock','GRN','SIV']}><Inventory /></PermRoute>} />
        <Route path="stock/adjustments" element={<PermRoute perms={['Stock']}><StockAdjustment /></PermRoute>} />
        <Route path="stock/categories" element={<PermRoute perms={['Stock']}><Categories /></PermRoute>} />
        <Route path="stock/bin-card" element={<PermRoute perms={['Stock','GRN','SIV']}><BinCard /></PermRoute>} />
        <Route path="stock/production" element={<PermRoute perms={['SIV','Stock']}><Production /></PermRoute>} />
        <Route path="stock/sales-returns" element={<PermRoute perms={['SIV','Stock']}><SalesReturn /></PermRoute>} />
        <Route path="accounting/cash-receipts" element={<PermRoute perms={['Accounting']}><CashReceipt /></PermRoute>} />
        <Route path="accounting/payment-vouchers" element={<PermRoute perms={['Accounting']}><PaymentVoucher /></PermRoute>} />
        <Route path="accounting/cash-book" element={<PermRoute perms={['Accounting']}><CashBook /></PermRoute>} />
        <Route path="accounting/account-payables" element={<PermRoute perms={['Accounting']}><AccountPayables /></PermRoute>} />
        <Route path="suppliers-customers/suppliers" element={<PermRoute perms={['Suppliers']}><Suppliers /></PermRoute>} />
        <Route path="suppliers-customers/customers" element={<PermRoute perms={['Customers']}><Customers /></PermRoute>} />
        <Route path="settings/profile" element={<Profile />} />
        <Route path="settings/users" element={<PermRoute adminOnly><Users /></PermRoute>} />
      </Route>
    </Routes>
    </div>
  );
}

function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <Router>
          <AppRoutes />
        </Router>
      </AuthProvider>
    </LanguageProvider>
  );
}

export default App;
