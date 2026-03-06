import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const VPS_URL = 'https://butchery.sidanitsolutions.com';

// Derive short branch code from branchId UUID
function toBranchCode(branchId) {
  if (!branchId || branchId === 'local-only') return null;
  return branchId.replace(/-/g, '').substring(0, 8).toUpperCase();
}

const Setup = ({ onComplete }) => {
  const navigate = useNavigate();

  // 'choose' | 'newBranch' | 'joinBranch'
  const [mode, setMode] = useState('choose');

  // New Branch fields
  const [email, setEmail]           = useState('');
  const [branchName, setBranchName] = useState('');
  const [licenseKey, setLicenseKey] = useState('');

  // Join Branch fields
  const [branchCode, setBranchCode]     = useState('');
  const [joinLicenseKey, setJoinLicenseKey] = useState('');

  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState('');
  const [alreadyConfigured, setAlreadyConfigured] = useState(false);
  const [existingBranchCode, setExistingBranchCode] = useState(null);
  const [identity, setIdentity] = useState(null);

  useEffect(() => {
    fetch('/api/sync/status')
      .then(r => r.json())
      .then(data => {
        if (data.isConfigured && data.tenantId && data.tenantId !== 'local-only') {
          setAlreadyConfigured(true);
          setExistingBranchCode(toBranchCode(data.branchId));
          // Fetch full identity from VPS
          fetch(`${VPS_URL}/api/sync/identity?tenantId=${data.tenantId}&branchId=${data.branchId}`)
            .then(r => r.json())
            .then(setIdentity)
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  // ── Save config locally and go to dashboard ───────────────────────────────
  const saveAndFinish = async (tenantId, branchId) => {
    const r = await fetch('/api/sync/configure', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ tenantId, branchId }),
    });
    if (!r.ok) throw new Error('Failed to save configuration locally');
    onComplete();
    navigate('/dashboard');
  };

  // ── New Branch handler ────────────────────────────────────────────────────
  const handleNewBranch = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`${VPS_URL}/api/sync/register`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          email:      email.trim(),
          branchName: branchName.trim(),
          licenseKey: licenseKey.trim(),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Registration failed');
      await saveAndFinish(data.tenantId, data.branchId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Join Branch handler ───────────────────────────────────────────────────
  const handleJoinBranch = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`${VPS_URL}/api/sync/join-branch`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          branchCode:  branchCode.trim(),
          licenseKey:  joinLicenseKey.trim(),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed to join branch');
      await saveAndFinish(data.tenantId, data.branchId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Skip handler ──────────────────────────────────────────────────────────
  const handleSkip = async () => {
    await fetch('/api/sync/configure', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ tenantId: 'local-only', branchId: 'local-only' }),
    }).catch(() => {});
    onComplete();
  };

  const cardStyle = {
    background: '#fff', borderRadius: 16, padding: '48px 40px',
    width: '100%', maxWidth: 440,
    boxShadow: '0 20px 60px rgba(0,0,0,0.1)',
  };
  const pageStyle = {
    minHeight: '100vh', display: 'flex', alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #f0f4ff 0%, #fdf2f8 100%)',
  };
  const inputStyle = {
    width: '100%', padding: '10px 12px', border: '1px solid #d1d5db',
    borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box',
  };
  const labelStyle = {
    display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6,
  };
  const primaryBtn = (disabled) => ({
    width: '100%', padding: '12px', background: disabled ? '#9ca3af' : '#2563eb',
    color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer', marginBottom: 12,
  });
  const secondaryBtn = {
    width: '100%', padding: '10px', background: 'transparent',
    color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: 8,
    fontSize: 14, cursor: 'pointer',
  };

  const logo = (
    <div style={{ textAlign: 'center', marginBottom: 32 }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>🥩</div>
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#111827' }}>Butchery Pro</h1>
      <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: 14 }}>Cloud Sync Setup</p>
    </div>
  );

  // ── Already configured ────────────────────────────────────────────────────
  if (alreadyConfigured) {
    const rowStyle = {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 0', borderBottom: '1px solid #f3f4f6',
    };
    const keyStyle  = { fontSize: 13, color: '#6b7280', fontWeight: 500 };
    const valStyle  = { fontSize: 13, color: '#111827', fontWeight: 600, textAlign: 'right' };

    return (
      <div style={pageStyle}>
        <div style={{ ...cardStyle, maxWidth: 480 }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
            <h2 style={{ margin: '0 0 4px', color: '#111827' }}>Cloud Sync Active</h2>
            <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>
              This device is registered and syncing with the cloud.
            </p>
          </div>

          {/* Identity info */}
          <div style={{ background: '#f9fafb', borderRadius: 10, padding: '4px 16px', marginBottom: 20 }}>
            <div style={rowStyle}>
              <span style={keyStyle}>Business Email</span>
              <span style={valStyle}>{identity?.email ?? '—'}</span>
            </div>
            <div style={rowStyle}>
              <span style={keyStyle}>Branch</span>
              <span style={valStyle}>{identity?.branchName ?? '—'}</span>
            </div>
            <div style={rowStyle}>
              <span style={keyStyle}>License Expires</span>
              <span style={{
                ...valStyle,
                color: identity?.isExpired ? '#dc2626' : identity?.daysRemaining <= 14 ? '#d97706' : '#111827',
              }}>
                {identity?.expiresAt
                  ? `${identity.expiresAt.substring(0, 10)} (${identity.daysRemaining}d remaining)`
                  : '—'}
              </span>
            </div>
            <div style={{ ...rowStyle, borderBottom: 'none' }}>
              <span style={keyStyle}>Max Branches</span>
              <span style={valStyle}>{identity?.maxBranches ?? '—'}</span>
            </div>
          </div>

          {/* Branch Code */}
          {existingBranchCode && (
            <div style={{
              background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10,
              padding: '14px 20px', marginBottom: 24, textAlign: 'center',
            }}>
              <div style={{ fontSize: 12, color: '#15803d', fontWeight: 600, marginBottom: 4 }}>
                BRANCH CODE — share when adding a new PC to this branch
              </div>
              <div style={{
                fontSize: 32, fontFamily: 'monospace', fontWeight: 700,
                letterSpacing: '6px', color: '#166534',
              }}>
                {existingBranchCode}
              </div>
            </div>
          )}

          <button
            onClick={() => navigate('/dashboard')}
            style={{ width: '100%', padding: '12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ── Choose mode ───────────────────────────────────────────────────────────
  if (mode === 'choose') {
    return (
      <div style={pageStyle}>
        <div style={{ ...cardStyle, maxWidth: 500 }}>
          {logo}
          <p style={{ textAlign: 'center', color: '#6b7280', fontSize: 14, marginBottom: 28 }}>
            How do you want to set up this PC?
          </p>
          <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
            <button
              onClick={() => setMode('newBranch')}
              style={{
                flex: 1, padding: '20px 16px', border: '2px solid #bfdbfe',
                borderRadius: 12, background: '#eff6ff', cursor: 'pointer', textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 8 }}>🏪</div>
              <div style={{ fontWeight: 700, color: '#1d4ed8', fontSize: 15 }}>New Branch</div>
              <div style={{ fontSize: 12, color: '#3b82f6', marginTop: 4 }}>
                First PC for a new branch
              </div>
            </button>
            <button
              onClick={() => setMode('joinBranch')}
              style={{
                flex: 1, padding: '20px 16px', border: '2px solid #bbf7d0',
                borderRadius: 12, background: '#f0fdf4', cursor: 'pointer', textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 8 }}>🔗</div>
              <div style={{ fontWeight: 700, color: '#15803d', fontSize: 15 }}>Join Branch</div>
              <div style={{ fontSize: 12, color: '#16a34a', marginTop: 4 }}>
                Add this PC to an existing branch
              </div>
            </button>
          </div>
          <button type="button" onClick={handleSkip} style={secondaryBtn}>
            Skip — Use Offline Only
          </button>
          <p style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', marginTop: 16, marginBottom: 0 }}>
            You can set up sync later from Settings → Cloud Sync
          </p>
        </div>
      </div>
    );
  }

  // ── New Branch form ───────────────────────────────────────────────────────
  if (mode === 'newBranch') {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          {logo}
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '12px 16px', marginBottom: 24, fontSize: 13, color: '#1d4ed8' }}>
            Register this device as a new branch to enable cloud sync.
          </div>
          <form onSubmit={handleNewBranch}>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Business Email</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder="owner@yourbusiness.com" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Branch Name</label>
              <input type="text" required value={branchName} onChange={e => setBranchName(e.target.value)}
                placeholder="e.g. Main Branch, City Centre" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>License Key</label>
              <input type="text" required value={licenseKey}
                onChange={e => setLicenseKey(e.target.value.toUpperCase())}
                placeholder="BUTCH-XXXX-XXXX-XXXX"
                style={{ ...inputStyle, fontFamily: 'monospace', letterSpacing: '1px' }} />
            </div>
            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#dc2626' }}>
                {error}
              </div>
            )}
            <button type="submit" disabled={loading} style={primaryBtn(loading)}>
              {loading ? 'Registering...' : 'Register & Enable Sync'}
            </button>
            <button type="button" onClick={() => { setMode('choose'); setError(''); }} style={secondaryBtn}>
              Back
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Join Branch form ──────────────────────────────────────────────────────
  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        {logo}
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 16px', marginBottom: 24, fontSize: 13, color: '#15803d' }}>
          Enter the Branch Code shown on a PC already registered to this branch.
        </div>
        <form onSubmit={handleJoinBranch}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Branch Code</label>
            <input type="text" required value={branchCode}
              onChange={e => setBranchCode(e.target.value.toUpperCase())}
              placeholder="e.g. A1B2C3D4"
              maxLength={8}
              style={{ ...inputStyle, fontFamily: 'monospace', letterSpacing: '4px', fontSize: 18, textAlign: 'center' }} />
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
              8-character code — find it on the other PC under Settings → Cloud Sync
            </div>
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>License Key</label>
            <input type="text" required value={joinLicenseKey}
              onChange={e => setJoinLicenseKey(e.target.value.toUpperCase())}
              placeholder="BUTCH-XXXX-XXXX-XXXX"
              style={{ ...inputStyle, fontFamily: 'monospace', letterSpacing: '1px' }} />
          </div>
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#dc2626' }}>
              {error}
            </div>
          )}
          <button type="submit" disabled={loading} style={primaryBtn(loading)}>
            {loading ? 'Joining...' : 'Join Branch'}
          </button>
          <button type="button" onClick={() => { setMode('choose'); setError(''); }} style={secondaryBtn}>
            Back
          </button>
        </form>
      </div>
    </div>
  );
};

export default Setup;
