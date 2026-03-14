import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getSettings, updateProfile, updateBusiness, getDrawerPort, updateDrawerPort } from '../services/api';
import { FiSave, FiUser, FiMail, FiPhone, FiMapPin, FiCloud, FiWifi, FiWifiOff, FiAlertTriangle, FiPrinter } from 'react-icons/fi';

const Profile = () => {
  const { user, logout } = useAuth();
  const [syncInfo, setSyncInfo]       = useState(null);
  const [resetting, setResetting]     = useState(false);

  useEffect(() => {
    fetch('/api/sync/status')
      .then(r => r.json())
      .then(setSyncInfo)
      .catch(() => {});
  }, []);

  const handleConnectToCloud = async () => {
    if (!window.confirm('This will disconnect your current sync settings and show the Cloud Setup screen. Continue?')) return;
    setResetting(true);
    try {
      await fetch('/api/sync/reset', { method: 'POST' });
      window.location.reload();
    } catch {
      alert('Failed to reset sync config. Make sure the backend is running.');
      setResetting(false);
    }
  };

  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', address: '', role: '',
    businessName: '', businessPhone: '', businessEmail: '',
  });
  const [saving, setSaving] = useState(false);
  const [resetStep, setResetStep] = useState(0); // 0=hidden, 1=confirm, 2=ask-settings
  const [factoryResetting, setFactoryResetting] = useState(false);
  const [drawerPort, setDrawerPort] = useState('POS-80');
  const [savingPort, setSavingPort] = useState(false);

  const doFactoryReset = async (includeSettings) => {
    setFactoryResetting(true);
    try {
      await fetch('/api/sync/factory-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ includeSettings }),
      });
      logout();
    } catch {
      alert('Factory reset failed. Please try again.');
      setFactoryResetting(false);
      setResetStep(0);
    }
  };

  useEffect(() => {
    getDrawerPort().then(res => setDrawerPort(res.data?.port || 'POS-80')).catch(() => {});
    getSettings().then(res => {
      const u = res.data?.user || {};
      const b = res.data?.business || {};
      setForm({
        firstName: u.first_name || '',
        lastName: u.last_name || '',
        email: u.email || '',
        phone: u.phone || '',
        address: u.address || '',
        role: u.role || '',
        businessName: b.business_name || '',
        businessPhone: b.business_phone || '',
        businessEmail: b.business_email || '',
      });
    }).catch(() => {});
  }, []);

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async e => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateProfile({ firstName: form.firstName, lastName: form.lastName, email: form.email, phone: form.phone, address: form.address });
      await updateBusiness({ business_name: form.businessName, business_phone: form.businessPhone, business_email: form.businessEmail });
      alert('Profile updated successfully!');
    } catch {
      alert('Failed to save. Please try again.');
    }
    setSaving(false);
  };

  const getInitials = () => `${form.firstName[0]}${form.lastName[0]}`.toUpperCase();

  const handleSaveDrawerPort = async () => {
    setSavingPort(true);
    try {
      await updateDrawerPort(drawerPort);
      alert('Drawer port saved successfully!');
    } catch {
      alert('Failed to save drawer port.');
    }
    setSavingPort(false);
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1>Profile Settings</h1>
          <p>Manage your account and business information</p>
        </div>
      </div>

      <div className="profile-layout">
        <div className="profile-sidebar-card">
          <div className="profile-avatar">{getInitials()}</div>
          <h3>{form.firstName} {form.lastName}</h3>
          <span className="profile-role">{form.role}</span>
          <div className="profile-status"><span className="status-dot active"></span> Active</div>
          <div className="profile-contact-info">
            <div className="profile-contact-item"><FiMail size={14} /> {form.email}</div>
            <div className="profile-contact-item"><FiPhone size={14} /> {form.phone}</div>
            <div className="profile-contact-item"><FiMapPin size={14} /> {form.address}</div>
          </div>
        </div>

        <div className="profile-form-card">
          <form onSubmit={handleSubmit}>
            <div className="form-section">
              <h3 className="form-section-title"><FiUser /> Personal Information</h3>
              <div className="form-grid">
                <div className="form-group">
                  <label>First Name</label>
                  <input type="text" name="firstName" value={form.firstName} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label>Last Name</label>
                  <input type="text" name="lastName" value={form.lastName} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label>Email Address</label>
                  <input type="email" name="email" value={form.email} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label>Phone Number</label>
                  <input type="tel" name="phone" value={form.phone} onChange={handleChange} />
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Address</label>
                  <input type="text" name="address" value={form.address} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label>Role</label>
                  <select name="role" value={form.role} onChange={handleChange}>
                    <option>Administrator</option>
                    <option>Manager</option>
                    <option>Cashier</option>
                    <option>Staff</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="form-section">
              <h3 className="form-section-title"><FiMapPin /> Business Information</h3>
              <div className="form-grid">
                <div className="form-group">
                  <label>Business Name</label>
                  <input type="text" name="businessName" value={form.businessName} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label>Business Phone</label>
                  <input type="tel" name="businessPhone" value={form.businessPhone} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label>Business Email</label>
                  <input type="email" name="businessEmail" value={form.businessEmail} onChange={handleChange} />
                </div>
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}><FiSave /> {saving ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </form>

          {/* POS Hardware Section */}
          <div className="form-section" style={{ marginTop: 24 }}>
            <h3 className="form-section-title"><FiPrinter /> POS Hardware</h3>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 14 }}>
              Enter the exact printer name your cash drawer is connected to. Find it in Windows → Devices and Printers (e.g. POS-80).
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Printer Name</label>
                <input
                  type="text"
                  value={drawerPort}
                  onChange={e => setDrawerPort(e.target.value)}
                  placeholder="e.g. POS-80"
                  style={{ width: 160 }}
                />
              </div>
              <button
                type="button"
                onClick={handleSaveDrawerPort}
                disabled={savingPort}
                className="btn btn-primary"
                style={{ marginTop: 18 }}
              >
                <FiSave /> {savingPort ? 'Saving...' : 'Save Port'}
              </button>
            </div>
          </div>

          {/* Cloud Sync Section */}
          <div className="form-section" style={{ marginTop: 24 }}>
            <h3 className="form-section-title"><FiCloud /> Cloud Sync</h3>
            {syncInfo ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                {syncInfo.tenantId === 'local-only' || !syncInfo.isConfigured ? (
                  <>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#6b7280' }}>
                      <FiWifiOff size={16} /> Offline Only — not connected to cloud
                    </span>
                    <button
                      className="btn btn-primary"
                      onClick={handleConnectToCloud}
                      disabled={resetting}
                      style={{ marginLeft: 'auto' }}
                    >
                      <FiWifi /> {resetting ? 'Resetting...' : 'Connect to Cloud'}
                    </button>
                  </>
                ) : (
                  <>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#16a34a' }}>
                      <FiWifi size={16} /> Connected to Cloud
                    </span>
                    <span style={{ color: '#6b7280', fontSize: 13 }}>
                      Tenant: <strong>{syncInfo.tenantId?.substring(0, 8)}…</strong> &nbsp;|&nbsp;
                      Branch: <strong>{syncInfo.branchId?.substring(0, 8)}…</strong>
                    </span>
                    <button
                      className="btn btn-secondary"
                      onClick={handleConnectToCloud}
                      disabled={resetting}
                      style={{ marginLeft: 'auto' }}
                    >
                      <FiWifiOff /> {resetting ? 'Resetting...' : 'Change / Disconnect'}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <span style={{ color: '#9ca3af', fontSize: 13 }}>Loading sync status…</span>
            )}
          </div>

          {/* Factory Reset Section */}
          <div className="form-section" style={{ marginTop: 24, borderTop: '2px solid #fee2e2', paddingTop: 20 }}>
            <h3 className="form-section-title" style={{ color: '#dc2626' }}><FiAlertTriangle /> Danger Zone</h3>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
              Factory reset wipes all local data — products, orders, GRN, SIV, customers, suppliers, and disconnects from cloud. This cannot be undone.
            </p>
            <button
              type="button"
              onClick={() => setResetStep(1)}
              style={{ padding: '9px 20px', background: '#fff', border: '2px solid #dc2626', borderRadius: 8, color: '#dc2626', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}
            >
              <FiAlertTriangle style={{ marginRight: 6 }} /> Factory Reset
            </button>
          </div>
        </div>
      </div>

      {/* ── Step 1: Confirm reset ── */}
      {resetStep === 1 && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '36px 40px', maxWidth: 400, width: '90%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <FiAlertTriangle size={28} color="#dc2626" />
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: 20 }}>Factory Reset?</h3>
            <p style={{ color: '#6b7280', fontSize: 14, margin: '0 0 24px' }}>
              This will permanently delete <strong>all data</strong> on this device — orders, products, GRN, SIV, customers, suppliers — and disconnect from cloud. This <strong>cannot be undone</strong>.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => setResetStep(0)} style={{ padding: '10px 24px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 14 }}>Cancel</button>
              <button onClick={() => setResetStep(2)} style={{ padding: '10px 24px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>Yes, Continue</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 2: Ask about settings ── */}
      {resetStep === 2 && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '36px 40px', maxWidth: 400, width: '90%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 18 }}>Delete Company Settings?</h3>
            <p style={{ color: '#6b7280', fontSize: 14, margin: '0 0 24px' }}>
              Do you also want to delete the company name, phone number, and email?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={() => doFactoryReset(true)}
                disabled={factoryResetting}
                style={{ padding: '12px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}
              >
                {factoryResetting ? 'Resetting...' : 'Yes — Delete Everything'}
              </button>
              <button
                onClick={() => doFactoryReset(false)}
                disabled={factoryResetting}
                style={{ padding: '12px', background: '#f97316', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}
              >
                {factoryResetting ? 'Resetting...' : 'No — Keep Company Settings'}
              </button>
              <button onClick={() => setResetStep(0)} disabled={factoryResetting} style={{ padding: '10px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 14 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;
