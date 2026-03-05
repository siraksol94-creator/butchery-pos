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

const PrivateRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div>Loading...</div>;
  return isAuthenticated ? children : <Navigate to="/login" />;
};

function AppRoutes() {
  const [syncChecked, setSyncChecked]     = useState(false);
  const [isConfigured, setIsConfigured]   = useState(true); // optimistic default
  const [licenseStatus, setLicenseStatus] = useState(null);

  useEffect(() => {
    fetch('/api/sync/status')
      .then(r => r.json())
      .then(data => {
        setIsConfigured(!!data.isConfigured);
        // Check license if connected to cloud
        if (data.isConfigured && data.tenantId && data.tenantId !== 'local-only') {
          fetch(`https://butchery.sidanitsolutions.com/api/sync/license-status?tenantId=${data.tenantId}`)
            .then(r => r.json())
            .then(setLicenseStatus)
            .catch(() => {});
        }
      })
      .catch(() => setIsConfigured(true))
      .finally(() => setSyncChecked(true));
  }, []);

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

  // License expired — block dashboard (login page still accessible for admin)
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

  return (
    <>
      <LicenseBanner licenseStatus={licenseStatus} />
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/setup" element={<Setup onComplete={() => setIsConfigured(true)} />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Navigate to="/dashboard" />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="pos" element={<POS />} />
        <Route path="pos/sales-report" element={<SalesReport />} />
        <Route path="pos/sales-inventory" element={<SalesInventory />} />
        <Route path="pos/cash-report" element={<CashReport />} />
        <Route path="stock/items" element={<ItemDetails />} />
        <Route path="stock/grn" element={<GRN />} />
        <Route path="stock/siv" element={<SIV />} />
        <Route path="stock/inventory" element={<Inventory />} />
        <Route path="stock/adjustments" element={<StockAdjustment />} />
        <Route path="stock/categories" element={<Categories />} />
        <Route path="stock/bin-card" element={<BinCard />} />
        <Route path="accounting/cash-receipts" element={<CashReceipt />} />
        <Route path="accounting/payment-vouchers" element={<PaymentVoucher />} />
        <Route path="accounting/cash-book" element={<CashBook />} />
        <Route path="accounting/account-payables" element={<AccountPayables />} />
        <Route path="suppliers-customers/suppliers" element={<Suppliers />} />
        <Route path="suppliers-customers/customers" element={<Customers />} />
        <Route path="settings/profile" element={<Profile />} />
        <Route path="settings/users" element={<Users />} />
      </Route>
    </Routes>
    </>
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
