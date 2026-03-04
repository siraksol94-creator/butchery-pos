import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { FiSave, FiUser, FiMail, FiPhone, FiMapPin, FiCloud, FiWifi, FiWifiOff } from 'react-icons/fi';

const Profile = () => {
  const { user } = useAuth();
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
    firstName: user?.name?.split(' ')[0] || 'Admin',
    lastName: user?.name?.split(' ')[1] || 'User',
    email: user?.email || 'admin@butcherypro.com',
    phone: '+1 555-0100',
    address: '123 Main Street, City',
    role: user?.role || 'Administrator',
    businessName: 'Butchery Pro',
    businessPhone: '+1 555-0000',
    businessEmail: 'info@butcherypro.com',
  });

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = e => {
    e.preventDefault();
    alert('Profile updated successfully!');
  };

  const getInitials = () => `${form.firstName[0]}${form.lastName[0]}`.toUpperCase();

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
              <button type="submit" className="btn btn-primary"><FiSave /> Save Changes</button>
            </div>
          </form>

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
        </div>
      </div>
    </div>
  );
};

export default Profile;
