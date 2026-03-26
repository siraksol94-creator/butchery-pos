import React, { useState, useEffect } from 'react';
import { getUsers, getUserStats, createUser, updateUser, deleteUser } from '../services/api';
import { FiPlus, FiSearch, FiEdit2, FiTrash2, FiUsers, FiUserCheck, FiUserX, FiShield, FiX, FiEye, FiEyeOff, FiUser, FiMail, FiPhone, FiLock } from 'react-icons/fi';
import Toast from '../components/Toast';

const ROLES = ['Administrator', 'Manager', 'Cashier', 'Staff'];
const ALL_PERMISSIONS = ['POS', 'Sales', 'Stock', 'GRN', 'SIV', 'Reports', 'Accounting', 'Customers', 'Suppliers', 'Full Access'];
const roleColors = { Administrator: '#dc2626', Manager: '#2563eb', Cashier: '#16a34a', Staff: '#f59e0b' };
const avatarColors = ['#dc2626', '#2563eb', '#16a34a', '#f59e0b', '#9333ea', '#0891b2', '#be185d'];

const emptyForm = { firstName: '', lastName: '', email: '', password: '', phone: '', role: 'Cashier', permissions: [], status: 'Active' };

const getInitials = (first, last) => `${(first || '')[0] || ''}${(last || '')[0] || ''}`.toUpperCase() || '?';

const Users = () => {
  const [stats, setStats] = useState({ totalUsers: 0, active: 0, inactive: 0, administrators: 0 });
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [loading, setLoading] = useState(true);

  const [modal, setModal] = useState(null); // null | 'add' | 'edit' | 'delete'
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchAll = async () => {
    try {
      const [statsRes, usersRes] = await Promise.all([getUserStats(), getUsers()]);
      if (statsRes.data) setStats(statsRes.data);
      if (usersRes.data) setUsers(usersRes.data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const openAdd = () => {
    setForm(emptyForm);
    setError('');
    setShowPassword(false);
    setModal('add');
  };

  const openEdit = (user) => {
    setSelected(user);
    setForm({
      firstName: user.first_name || '',
      lastName: user.last_name || '',
      email: user.email || '',
      password: '',
      phone: user.phone || '',
      role: user.role || 'Cashier',
      permissions: Array.isArray(user.permissions) ? user.permissions : [],
      status: user.status || 'Active',
    });
    setError('');
    setShowPassword(false);
    setModal('edit');
  };

  const openDelete = (user) => { setSelected(user); setModal('delete'); };

  const closeModal = () => { setModal(null); setSelected(null); setError(''); };

  const togglePermission = (perm) => {
    setForm(f => ({
      ...f,
      permissions: f.permissions.includes(perm)
        ? f.permissions.filter(p => p !== perm)
        : [...f.permissions, perm],
    }));
  };

  const handleSave = async () => {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      setError('First name, last name, and email are required.');
      return;
    }
    if (modal === 'add' && !form.password.trim()) {
      setError('Password is required for new users.');
      return;
    }
    if (modal === 'edit') {
      if (!window.confirm('Are you sure you want to update this record?')) return;
    }
    setSaving(true);
    setError('');
    try {
      if (modal === 'add') {
        await createUser({ ...form });
        await fetchAll();
        closeModal();
        showToast('User saved successfully.');
      } else {
        const payload = { ...form };
        if (!payload.password) delete payload.password;
        await updateUser(selected.id, payload);
        await fetchAll();
        closeModal();
        showToast('User updated successfully.');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save. Please try again.');
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteUser(selected.id);
      await fetchAll();
      closeModal();
      showToast('User deleted.', 'error');
    } catch {
      setError('Failed to delete user.');
    }
    setDeleting(false);
  };

  const filtered = users.filter(u => {
    const name = `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase()) || (u.email || '').toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === 'All' || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1>User Management</h1>
          <p>Manage staff accounts and permissions</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FiPlus /> Add User
        </button>
      </div>

      {/* Stats */}
      <div className="stat-cards" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="stat-card stat-card-blue">
          <div className="stat-icon" style={{ background: '#dbeafe', color: '#2563eb' }}><FiUsers /></div>
          <div><div className="stat-label">Total Users</div><div className="stat-value">{stats.totalUsers}</div></div>
        </div>
        <div className="stat-card stat-card-green">
          <div className="stat-icon" style={{ background: '#dcfce7', color: '#16a34a' }}><FiUserCheck /></div>
          <div><div className="stat-label">Active</div><div className="stat-value">{stats.active}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#fee2e2', color: '#dc2626' }}><FiUserX /></div>
          <div><div className="stat-label">Inactive</div><div className="stat-value">{stats.inactive}</div></div>
        </div>
        <div className="stat-card stat-card-red">
          <div className="stat-icon" style={{ background: '#fef3c7', color: '#f59e0b' }}><FiShield /></div>
          <div><div className="stat-label">Administrators</div><div className="stat-value">{stats.administrators}</div></div>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <div className="search-input-container">
          <FiSearch style={{ color: '#9ca3af' }} />
          <input type="text" placeholder="Search by name or email..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="filter-dropdown">
          <option value="All">All Roles</option>
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>Role</th>
              <th>Permissions</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: '#9ca3af' }}>Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: '#9ca3af' }}>No users found.</td></tr>
            ) : filtered.map((user, idx) => (
              <tr key={user.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="table-avatar" style={{ background: avatarColors[idx % avatarColors.length], flexShrink: 0 }}>
                      {getInitials(user.first_name, user.last_name)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{user.first_name} {user.last_name}</div>
                      {user.phone && <div style={{ fontSize: 12, color: '#9ca3af' }}>{user.phone}</div>}
                    </div>
                  </div>
                </td>
                <td style={{ fontSize: 13, color: '#4b5563' }}>{user.email}</td>
                <td>
                  <span className="badge" style={{ background: `${roleColors[user.role] || '#6b7280'}18`, color: roleColors[user.role] || '#6b7280', fontWeight: 600 }}>
                    {user.role}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {(user.permissions || []).length === 0
                      ? <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>
                      : (user.permissions || []).map(p => (
                          <span key={p} className="permission-badge" style={{ fontSize: 11, padding: '2px 7px', background: '#f1f5f9', color: '#475569', borderRadius: 4, border: '1px solid #e2e8f0' }}>{p}</span>
                        ))
                    }
                  </div>
                </td>
                <td>
                  <span className={`badge ${user.status === 'Active' ? 'badge-success' : 'badge-danger'}`}>
                    {user.status || 'Active'}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => openEdit(user)}
                      title="Edit user"
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                    >
                      <FiEdit2 size={13} /> Edit
                    </button>
                    <button
                      onClick={() => openDelete(user)}
                      title="Delete user"
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#fff1f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                    >
                      <FiTrash2 size={13} /> Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Modal */}
      {(modal === 'add' || modal === 'edit') && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                  <FiUser size={18} />
                </div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{modal === 'add' ? 'Add New User' : 'Edit User'}</h3>
              </div>
              <button onClick={closeModal} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6b7280' }}>
                <FiX size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
              {error && (
                <div style={{ background: '#fff1f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13, marginBottom: 16 }}>
                  {error}
                </div>
              )}

              {/* Name Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>First Name *</label>
                  <div style={inputWrap}>
                    <FiUser size={14} style={iconStyle} />
                    <input style={inputStyle} placeholder="First name" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Last Name *</label>
                  <div style={inputWrap}>
                    <FiUser size={14} style={iconStyle} />
                    <input style={inputStyle} placeholder="Last name" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} />
                  </div>
                </div>
              </div>

              {/* Email */}
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Username *</label>
                <div style={inputWrap}>
                  <FiMail size={14} style={iconStyle} />
                  <input style={inputStyle} placeholder="Username" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
              </div>

              {/* Phone */}
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Phone</label>
                <div style={inputWrap}>
                  <FiPhone size={14} style={iconStyle} />
                  <input style={inputStyle} placeholder="Phone number" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
              </div>

              {/* Password */}
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>{modal === 'add' ? 'Password *' : 'New Password (leave blank to keep current)'}</label>
                <div style={inputWrap}>
                  <FiLock size={14} style={iconStyle} />
                  <input style={{ ...inputStyle, paddingRight: 36 }} type={showPassword ? 'text' : 'password'} placeholder={modal === 'add' ? 'Set password' : 'Leave blank to keep current'} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                  <button type="button" onClick={() => setShowPassword(s => !s)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0 }}>
                    {showPassword ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                  </button>
                </div>
              </div>

              {/* Role + Status */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>Role</label>
                  <select style={selectStyle} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Status</label>
                  <select style={selectStyle} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>

              {/* Permissions */}
              <div>
                <label style={{ ...labelStyle, marginBottom: 8, display: 'block' }}>Permissions</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {ALL_PERMISSIONS.map(perm => {
                    const checked = form.permissions.includes(perm);
                    return (
                      <button
                        key={perm}
                        type="button"
                        onClick={() => togglePermission(perm)}
                        style={{
                          padding: '6px 14px',
                          borderRadius: 20,
                          border: checked ? '1.5px solid #2563eb' : '1.5px solid #e2e8f0',
                          background: checked ? '#eff6ff' : '#f9fafb',
                          color: checked ? '#2563eb' : '#6b7280',
                          fontWeight: checked ? 700 : 400,
                          fontSize: 13,
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                      >
                        {perm}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ display: 'flex', gap: 10, padding: '16px 24px', borderTop: '1px solid #f1f5f9', justifyContent: 'flex-end' }}>
              <button onClick={closeModal} style={{ padding: '10px 20px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 14, color: '#374151', fontWeight: 500 }}>
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ padding: '10px 24px', background: saving ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700 }}
              >
                {saving ? 'Saving...' : modal === 'add' ? 'Create User' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {modal === 'delete' && selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '36px 40px', maxWidth: 400, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#fff1f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <FiTrash2 size={28} color="#dc2626" />
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700 }}>Delete User?</h3>
            <p style={{ color: '#6b7280', fontSize: 14, margin: '0 0 6px' }}>
              Are you sure you want to delete
            </p>
            <p style={{ color: '#111827', fontSize: 15, fontWeight: 700, margin: '0 0 24px' }}>
              {selected.first_name} {selected.last_name}
            </p>
            {error && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={closeModal} style={{ padding: '10px 24px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{ padding: '10px 24px', background: deleting ? '#fca5a5' : '#dc2626', color: '#fff', border: 'none', borderRadius: 8, cursor: deleting ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700 }}
              >
                {deleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
      <Toast message={toast?.msg} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
};

const labelStyle = { fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6, display: 'block' };
const inputWrap = { position: 'relative', display: 'flex', alignItems: 'center' };
const iconStyle = { position: 'absolute', left: 10, color: '#9ca3af', pointerEvents: 'none' };
const inputStyle = { width: '100%', padding: '9px 10px 9px 32px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box', background: '#fafafa' };
const selectStyle = { width: '100%', padding: '9px 10px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 14, outline: 'none', background: '#fafafa', cursor: 'pointer' };

export default Users;
