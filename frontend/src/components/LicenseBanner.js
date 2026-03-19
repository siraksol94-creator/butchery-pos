import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiAlertTriangle, FiXCircle } from 'react-icons/fi';

const LicenseBanner = ({ licenseStatus, trialStatus, hasUsers }) => {
  const navigate = useNavigate();
  // Cloud license warning
  if (licenseStatus && !licenseStatus.localOnly && licenseStatus.valid !== undefined) {
    const { isExpired, daysRemaining, expiresAt } = licenseStatus;
    const expireDate = expiresAt ? expiresAt.substring(0, 10) : '';

    if (isExpired) {
      return (
        <div style={{
          background: '#fef2f2', borderBottom: '2px solid #fca5a5',
          padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 10,
          color: '#dc2626', fontSize: 14,
        }}>
          <FiXCircle size={16} />
          <strong>License Expired</strong> — Your license expired on {expireDate}.
          Please contact your software provider to renew.
        </div>
      );
    }

    if (daysRemaining <= 14) {
      return (
        <div style={{
          background: '#fffbeb', borderBottom: '2px solid #fcd34d',
          padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 10,
          color: '#92400e', fontSize: 14,
        }}>
          <FiAlertTriangle size={16} />
          <strong>License Expiring Soon</strong> — Your license expires on {expireDate}
          ({daysRemaining} day{daysRemaining !== 1 ? 's' : ''} remaining).
          Contact your software provider to renew.
        </div>
      );
    }
  }

  // Trial warning for local-only users (not expired — expired is blocked in App.js)
  if (trialStatus?.trialApplicable && !trialStatus?.isExpired) {
    const { daysRemaining } = trialStatus;
    return (
      <div style={{
        background: '#fffbeb', borderBottom: '2px solid #fcd34d',
        padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 10,
        color: '#92400e', fontSize: 14, flexWrap: 'wrap',
      }}>
        <FiAlertTriangle size={16} />
        <strong>Free Trial</strong> — {daysRemaining} day{daysRemaining !== 1 ? 's' : ''} remaining.
        Contact SIDAN IT and Business Solutions to activate your license.
        {!hasUsers && (
          <button onClick={() => navigate('/register')} style={{ marginLeft: 'auto', padding: '4px 14px', background: '#d97706', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Create Account
          </button>
        )}
      </div>
    );
  }

  return null;
};

export default LicenseBanner;
