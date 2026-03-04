import React, { useState } from 'react';

const Setup = ({ onComplete }) => {
  const [email, setEmail]           = useState('');
  const [branchName, setBranchName] = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');

  const handleSetup = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      // Register on VPS — creates/finds tenant + creates branch
      const r1 = await fetch('/api/sync/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: email.trim(), branchName: branchName.trim() }),
      });
      const data1 = await r1.json();
      if (!r1.ok) throw new Error(data1.error || 'Registration failed');

      // Save tenantId + branchId locally
      const r2 = await fetch('/api/sync/configure', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tenantId: data1.tenantId, branchId: data1.branchId }),
      });
      if (!r2.ok) throw new Error('Failed to save configuration');

      onComplete();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    // Use 'local-only' as tenantId — sync service will skip push/pull for this value
    await fetch('/api/sync/configure', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ tenantId: 'local-only', branchId: 'local-only' }),
    }).catch(() => {});
    onComplete();
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #f0f4ff 0%, #fdf2f8 100%)',
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: '48px 40px',
        width: '100%', maxWidth: 440,
        boxShadow: '0 20px 60px rgba(0,0,0,0.1)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🥩</div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#111827' }}>
            Butchery Pro
          </h1>
          <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: 14 }}>
            Cloud Sync Setup
          </p>
        </div>

        {/* Info */}
        <div style={{
          background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8,
          padding: '12px 16px', marginBottom: 24, fontSize: 13, color: '#1d4ed8',
        }}>
          Register this device to enable automatic data sync across all your branches and PCs.
        </div>

        {/* Form */}
        <form onSubmit={handleSetup}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
              Business Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="owner@yourbusiness.com"
              style={{
                width: '100%', padding: '10px 12px', border: '1px solid #d1d5db',
                borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
              Branch Name
            </label>
            <input
              type="text"
              required
              value={branchName}
              onChange={e => setBranchName(e.target.value)}
              placeholder="e.g. Main Branch, City Centre"
              style={{
                width: '100%', padding: '10px 12px', border: '1px solid #d1d5db',
                borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {error && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
              padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#dc2626',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '12px', background: loading ? '#9ca3af' : '#2563eb',
              color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer', marginBottom: 12,
            }}
          >
            {loading ? 'Registering...' : 'Register & Enable Sync'}
          </button>

          <button
            type="button"
            onClick={handleSkip}
            disabled={loading}
            style={{
              width: '100%', padding: '10px', background: 'transparent',
              color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: 8,
              fontSize: 14, cursor: 'pointer',
            }}
          >
            Skip — Use Offline Only
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', marginTop: 20, marginBottom: 0 }}>
          You can set up sync later from the Settings menu
        </p>
      </div>
    </div>
  );
};

export default Setup;
